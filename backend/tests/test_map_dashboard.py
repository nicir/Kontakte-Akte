from __future__ import annotations

from datetime import date, timedelta

from tests.conftest import Api, rahul


def counts(api: Api, dimension: str) -> dict[str, int]:
    return {c["code"]: c["count"] for c in api.get("/api/map", dimension=dimension)["countries"]}


def seed(api: Api) -> dict[str, str]:
    return {
        "rahul": api.create_contact(**rahul())["id"],
        "maria": api.create_contact(
            first_name="Maria",
            countries={"residence": ["DE"], "nationality": ["DE", "IT"], "expertise": ["IN", "DE"], "activity": ["DE"]},
            classifications={"profession": ["Rechtsanwältin"], "specialization": ["Steuerrecht"]},
            current_organization="Kanzlei Müller",
        )["id"],
        "anil": api.create_contact(
            first_name="Anil",
            countries={"residence": ["SG"], "nationality": ["IN"], "expertise": ["IN"]},
            classifications={"profession": ["Rechtsanwalt"]},
        )["id"],
    }


def test_scenario_e_map_dimensions(api: Api) -> None:
    seed(api)
    assert counts(api, "residence") == {"SG": 2, "DE": 1}
    assert counts(api, "nationality") == {"IN": 2, "DE": 1, "IT": 1}
    assert counts(api, "activity") == {"IN": 1, "SG": 1, "AE": 1, "DE": 1}
    assert counts(api, "expertise") == {"IN": 3, "DE": 1}
    assert counts(api, "interest") == {"DE": 1, "FR": 1}
    full = api.get("/api/map", dimension="expertise")
    assert full["max_count"] == 3 and full["contacts_with_country"] == 3
    india = next(c for c in full["countries"] if c["code"] == "IN")
    assert india == {"code": "IN", "numeric": "356", "name": "Indien", "count": 3}


def test_no_duplicate_counting_per_country(api: Api) -> None:
    api.create_contact(first_name="Doppelt", countries={"activity": ["IN", "IN", "IN"], "expertise": ["IN"]})
    assert counts(api, "activity") == {"IN": 1}
    c = api.search()["items"][0]
    detail = api.get(f"/api/contacts/{c['id']}")
    assert [x["code"] for x in detail["countries"]["activity"]] == ["IN"]


def test_country_click_lists_matching_contacts(api: Api) -> None:
    seed(api)
    india = api.get("/api/map/IN", dimension="expertise")
    assert india["name"] == "Indien" and india["count"] == 3
    assert sorted(c["display_name"] for c in india["contacts"]) == ["Anil", "Maria", "Rahul Sharma"]
    assert {p["name"]: p["count"] for p in india["professions"]} == {"Rechtsanwalt": 2, "Rechtsanwältin": 1}
    assert {c["name"] for c in india["companies"]} == {"Kanzlei Müller", "Sharma & Partners LLP"}
    singapore = api.get("/api/map/SG", dimension="residence")
    assert sorted(c["display_name"] for c in singapore["contacts"]) == ["Anil", "Rahul Sharma"]
    assert api.get("/api/map/IN", dimension="residence")["count"] == 0
    api.get("/api/map/ZZ", dimension="residence", expect=404)


def test_countries_reference_list(api: Api) -> None:
    countries = api.get("/api/countries")
    by_code = {c["code"]: c for c in countries}
    assert len(countries) >= 249
    assert by_code["DE"]["name"] == "Deutschland" and by_code["SG"]["numeric"] == "702"


def test_dashboard(api: Api) -> None:
    ids = seed(api)
    old = (date.today() - timedelta(days=200)).isoformat()
    recent = (date.today() - timedelta(days=5)).isoformat()
    api.post(
        "/api/interactions",
        {"occurred_on": old, "kind": "email", "title": "Alt", "participant_ids": [ids["maria"]]},
        expect=201,
    )
    api.post(
        "/api/interactions",
        {"occurred_on": recent, "kind": "phone", "title": "Neu", "participant_ids": [ids["rahul"]]},
        expect=201,
    )
    dash = api.get("/api/dashboard", tz="Europe/Berlin")
    assert dash["total_contacts"] == 3
    assert dash["countries_represented"] == 6  # IN, SG, AE, DE, FR, IT
    assert dash["recently_added"][0]["display_name"] == "Anil"
    assert [c["display_name"] for c in dash["recently_contacted"]] == ["Rahul Sharma", "Maria"]
    # Maria: last interaction 200 days ago → inactive. Rahul: recent. Anil: created today.
    # Rahul's first meeting (2026-03-01) is irrelevant because he has a recent interaction.
    assert [i["contact"]["display_name"] for i in dash["inactive_contacts"]] == ["Maria"]
    assert dash["inactive_contacts"][0]["days"] == 200
    api.put("/api/settings", {"inactivity_days": 365})
    assert api.get("/api/dashboard", tz="Europe/Berlin")["inactive_total"] == 0


def test_settings_roundtrip(api: Api) -> None:
    defaults = api.get("/api/settings")
    assert defaults == {
        "auto_lock_minutes": 15,
        "notifications_enabled": True,
        "notification_show_details": True,
        "inactivity_days": 90,
    }
    updated = api.put("/api/settings", {"auto_lock_minutes": 5, "notifications_enabled": False})
    assert updated["auto_lock_minutes"] == 5 and updated["notifications_enabled"] is False
    api.put("/api/settings", {"inactivity_days": 1}, expect=422)
