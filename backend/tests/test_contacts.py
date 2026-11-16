from __future__ import annotations

import base64

from tests.conftest import Api, rahul

PNG_1PX = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000"
        "1ff1a0b8a8f0000000049454e44ae426082"
    )
).decode()


def test_create_contact_with_all_classifications(api: Api) -> None:
    c = api.create_contact(**rahul())
    assert c["display_name"] == "Rahul Sharma"
    assert c["initials"] == "RS"
    assert c["current_organization"] == "Sharma & Partners LLP"
    assert [x["code"] for x in c["countries"]["nationality"]] == ["IN"]
    assert [x["name"] for x in c["countries"]["residence"]] == ["Singapur"]
    assert sorted(x["code"] for x in c["countries"]["activity"]) == ["AE", "IN", "SG"]
    assert [x["code"] for x in c["countries"]["expertise"]] == ["IN"]
    assert sorted(x["code"] for x in c["countries"]["interest"]) == ["DE", "FR"]
    assert c["classifications"]["specialization"] == ["Indisches Steuerrecht", "Internationales Steuerrecht"]
    assert c["classifications"]["industry"] == ["Rechtsberatung", "Finanzdienstleistungen"]
    assert c["first_met_place"] == "Konferenz in Singapur"
    assert [ch["value"] for ch in c["channels"]] == ["rahul@example.com", "+65 1234 5678"]


def test_multiple_nationalities(api: Api) -> None:
    c = api.create_contact(first_name="Maria", countries={"nationality": ["DE", "IT"]})
    assert sorted(x["code"] for x in c["countries"]["nationality"]) == ["DE", "IT"]


def test_only_a_name_is_required(api: Api) -> None:
    assert api.create_contact(last_name="Müller")["display_name"] == "Müller"
    r = api.post("/api/contacts", {"first_name": "  "}, expect=422)
    assert r["detail"]["message"] == "Bitte gib mindestens einen Namen ein."


def test_invalid_country_rejected(api: Api) -> None:
    r = api.post("/api/contacts", {"first_name": "X", "countries": {"residence": ["ZZ"]}}, expect=422)
    assert "ZZ" in r["detail"]["message"]


def test_edit_contact(api: Api) -> None:
    c = api.create_contact(**rahul())
    data = rahul()
    data["job_title"] = "Senior Partner"
    data["classifications"]["specialization"] = ["Indisches Steuerrecht"]
    data["countries"]["activity"] = ["IN"]
    data["previous_organizations"] = ["Big Four India"]
    updated = api.put(f"/api/contacts/{c['id']}", data)
    assert updated["job_title"] == "Senior Partner"
    assert updated["classifications"]["specialization"] == ["Indisches Steuerrecht"]
    assert [x["code"] for x in updated["countries"]["activity"]] == ["IN"]
    assert updated["previous_organizations"] == ["Big Four India"]


def test_classification_normalisation_avoids_duplicates(api: Api) -> None:
    api.create_contact(first_name="A", classifications={"specialization": ["Steuerrecht"]})
    api.create_contact(first_name="B", classifications={"specialization": ["steuerrecht"]})
    api.create_contact(first_name="C", classifications={"specialization": ["Steuerrecht ", "STEUERRECHT"]})
    items = api.get("/api/classifications", kind="specialization")
    assert len(items) == 1
    assert items[0]["name"] == "Steuerrecht" and items[0]["contact_count"] == 3
    # Distinct terms are NOT merged automatically.
    api.create_contact(first_name="D", classifications={"specialization": ["Steuerberatung"]})
    assert len(api.get("/api/classifications", kind="specialization")) == 2


def test_autocomplete_uses_existing_values(api: Api) -> None:
    api.create_contact(first_name="A", classifications={"specialization": ["Steuerrecht", "Gesellschaftsrecht"]})
    api.create_contact(first_name="B", classifications={"specialization": ["Steuerrecht"]})
    names = [s["name"] for s in api.get("/api/classifications/suggest", kind="specialization", q="steu")]
    assert names == ["Steuerrecht"]
    all_names = [s["name"] for s in api.get("/api/classifications/suggest", kind="specialization", q="")]
    assert all_names[0] == "Steuerrecht"  # most used first
    orgs = api.get("/api/organizations/suggest", q="")
    assert orgs == []


def test_alias_resolution_and_merge(api: Api) -> None:
    a = api.create_contact(first_name="A", classifications={"specialization": ["Steuerrecht"]})
    b = api.create_contact(first_name="B", classifications={"specialization": ["Tax Law"]})
    items = {i["name"]: i for i in api.get("/api/classifications", kind="specialization")}
    api.post(f"/api/classifications/{items['Tax Law']['id']}/merge", {"target_id": items["Steuerrecht"]["id"]})
    merged = api.get("/api/classifications", kind="specialization")
    assert len(merged) == 1 and merged[0]["contact_count"] == 2
    assert [x["alias"] for x in merged[0]["aliases"]] == ["Tax Law"]
    assert api.get(f"/api/contacts/{b['id']}")["classifications"]["specialization"] == ["Steuerrecht"]
    # New input using the alias resolves to the canonical value.
    c = api.create_contact(first_name="C", classifications={"specialization": ["tax law"]})
    assert c["classifications"]["specialization"] == ["Steuerrecht"]
    assert api.search(text="tax law")["total"] == 3
    assert a["id"]


def test_rename_conflict_requires_merge(api: Api) -> None:
    api.create_contact(first_name="A", classifications={"tag": ["Investor", "Mentor"]})
    items = {i["name"]: i for i in api.get("/api/classifications", kind="tag")}
    r = api.request("PATCH", f"/api/classifications/{items['Mentor']['id']}", {"name": "investor"}, expect=409)
    assert "Zusammenführen" in r["detail"]["message"]


def test_delete_contact_keeps_shared_entities(api: Api) -> None:
    r = api.create_contact(**rahul())
    m = api.create_contact(
        first_name="Maria",
        current_organization="Sharma & Partners LLP",
        classifications={"specialization": ["Indisches Steuerrecht"]},
    )
    api.post(
        f"/api/contacts/{r['id']}/links", {"target_contact_id": m["id"], "relation_type": "arbeitet mit"}, expect=201
    )
    shared = api.post(
        "/api/interactions",
        {"occurred_on": "2026-03-15", "kind": "meeting", "title": "Treffen", "participant_ids": [r["id"], m["id"]]},
        expect=201,
    )
    api.post(
        "/api/interactions",
        {"occurred_on": "2026-03-16", "kind": "phone", "title": "Nur Rahul", "participant_ids": [r["id"]]},
        expect=201,
    )
    api.delete(f"/api/contacts/{r['id']}")
    api.get(f"/api/contacts/{r['id']}", expect=404)
    maria = api.get(f"/api/contacts/{m['id']}")
    assert maria["current_organization"] == "Sharma & Partners LLP"
    assert maria["classifications"]["specialization"] == ["Indisches Steuerrecht"]
    assert maria["links"] == []
    interactions = api.get("/api/interactions", contact_id=m["id"])
    assert [i["id"] for i in interactions] == [shared["id"]]
    assert [p["display_name"] for p in interactions[0]["participants"]] == ["Maria"]
    assert len(api.get("/api/interactions")) == 1  # exclusive interaction removed
    assert api.search(text="Rahul")["total"] == 0


def test_linked_contacts_both_directions(api: Api) -> None:
    r = api.create_contact(first_name="Rahul")
    m = api.create_contact(first_name="Maria")
    detail = api.post(
        f"/api/contacts/{r['id']}/links",
        {"target_contact_id": m["id"], "relation_type": "hat mich vorgestellt", "description": "Konferenz 2026"},
        expect=201,
    )
    assert detail["links"][0]["direction"] == "outgoing"
    assert detail["links"][0]["other"]["display_name"] == "Maria"
    maria = api.get(f"/api/contacts/{m['id']}")
    assert maria["links"][0]["direction"] == "incoming"
    assert maria["links"][0]["other"]["id"] == r["id"]
    link_id = maria["links"][0]["id"]
    api.put(f"/api/links/{link_id}", {"relation_type": "Geschäftspartner/in"})
    assert api.get(f"/api/contacts/{r['id']}")["links"][0]["relation_type"] == "Geschäftspartner/in"
    api.post(f"/api/contacts/{r['id']}/links", {"target_contact_id": r["id"], "relation_type": "x"}, expect=422)
    api.delete(f"/api/links/{link_id}")
    assert api.get(f"/api/contacts/{r['id']}")["links"] == []
    assert "hat mich vorgestellt" in api.get("/api/link-types")


def test_introduced_by_contact(api: Api) -> None:
    maria = api.create_contact(first_name="Maria", last_name="Rossi")
    rahul_c = api.create_contact(first_name="Rahul", introduced_by_id=maria["id"])
    assert rahul_c["introduced_by"]["display_name"] == "Maria Rossi"
    assert api.search(text="Rossi")["total"] == 2


def test_contact_persists_after_restart(api: Api, make_api) -> None:  # type: ignore[no-untyped-def]
    c = api.create_contact(**rahul())
    restarted = make_api()  # new process, same data directory → database is locked
    restarted.post("/api/contacts/search", {}, expect=423)
    restarted.unlock()
    detail = restarted.get(f"/api/contacts/{c['id']}")
    assert detail["classifications"] == c["classifications"]
    assert detail["countries"] == c["countries"]


def test_notes_update(api: Api) -> None:
    c = api.create_contact(first_name="Rahul")
    updated = api.put(f"/api/contacts/{c['id']}/notes", {"personal_notes": "Mag Cricket."})
    assert updated["personal_notes"] == "Mag Cricket."
    assert api.search(text="cricket")["total"] == 1


def test_photo_upload_stored_encrypted(api: Api) -> None:
    c = api.create_contact(first_name="Rahul")
    api.put(
        f"/api/contacts/{c['id']}/photo",
        {"mime_type": "image/png", "image_base64": PNG_1PX, "thumbnail_base64": PNG_1PX},
    )
    assert api.get(f"/api/contacts/{c['id']}")["has_photo"] is True
    assert api.get(f"/api/contacts/{c['id']}/photo")["image_base64"] == PNG_1PX
    assert api.search()["items"][0]["thumbnail"].startswith("data:image/png;base64,")
    bad = base64.b64encode(b"<svg></svg>").decode()
    api.put(
        f"/api/contacts/{c['id']}/photo",
        {"mime_type": "image/png", "image_base64": bad, "thumbnail_base64": bad},
        expect=422,
    )
    api.delete(f"/api/contacts/{c['id']}/photo")
    assert api.get(f"/api/contacts/{c['id']}")["has_photo"] is False
    assert not list((api.root / "data").glob("*.png"))


def test_relationship_categories_editable(api: Api) -> None:
    cats = api.get("/api/relationship-categories")
    assert "Berufliches Netzwerk" in [c["name"] for c in cats]
    new = api.post("/api/relationship-categories", {"name": "Alumni"}, expect=201)
    c = api.create_contact(first_name="A", relationship_category_id=new["id"])
    assert c["relationship_category"]["name"] == "Alumni"
    api.request("PATCH", f"/api/relationship-categories/{new['id']}", {"name": "Alumni-Netzwerk"})
    assert api.get(f"/api/contacts/{c['id']}")["relationship_category"]["name"] == "Alumni-Netzwerk"
    api.delete(f"/api/relationship-categories/{new['id']}")
    assert api.get(f"/api/contacts/{c['id']}")["relationship_category"] is None
    assert api.get(f"/api/contacts/{c['id']}")["display_name"] == "A"  # contact itself untouched
