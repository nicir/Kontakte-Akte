from __future__ import annotations

from pathlib import Path

import pytest

from tests.conftest import Api, rahul


@pytest.fixture
def network(api: Api) -> dict[str, str]:
    ids = {}
    ids["rahul"] = api.create_contact(**rahul())["id"]
    ids["maria"] = api.create_contact(
        first_name="Maria",
        last_name="Müller",
        current_organization="Kanzlei Müller",
        countries={"nationality": ["DE"], "residence": ["DE"], "expertise": ["DE", "IN"], "activity": ["DE"]},
        classifications={
            "profession": ["Rechtsanwältin"],
            "specialization": ["Deutsches Gesellschaftsrecht", "Steuerrecht"],
            "industry": ["Rechtsberatung"],
            "tag": ["Mentor"],
        },
    )["id"]
    ids["priya"] = api.create_contact(
        first_name="Priya",
        last_name="Nair",
        countries={"nationality": ["IN"], "residence": ["IN"], "expertise": ["SG"]},
        classifications={
            "profession": ["Steuerberaterin"],
            "specialization": ["Transfer Pricing"],
            "industry": ["Finanzdienstleistungen"],
        },
    )["id"]
    ids["thomas"] = api.create_contact(
        first_name="Thomas",
        last_name="Weber",
        current_organization="Infra Capital GmbH",
        countries={"residence": ["DE"], "interest": ["IN"]},
        classifications={"profession": ["Investor"], "industry": ["Private Equity"], "interest": ["Infrastruktur"]},
    )["id"]
    return ids


def names(result: dict) -> list[str]:  # type: ignore[type-arg]
    return sorted(item["display_name"] for item in result["items"])


def test_name_search_partial_case_and_diacritics(api: Api, network: dict[str, str]) -> None:
    assert names(api.search(text="rahul")) == ["Rahul Sharma"]
    assert names(api.search(text="SHAR")) == ["Rahul Sharma"]
    assert names(api.search(text="müller")) == ["Maria Müller"]
    assert names(api.search(text="muller")) == ["Maria Müller"]
    assert names(api.search(text="Mueller")) == ["Maria Müller"]
    assert names(api.search(text="ma")) == [
        "Maria Müller",
        "Rahul Sharma",
        "Thomas Weber",
    ]  # 2-letter term (Sharma, Thomas)


def test_profession_expertise_industry_company_search(api: Api, network: dict[str, str]) -> None:
    assert names(api.search(text="rechtsanw")) == ["Maria Müller", "Rahul Sharma"]
    assert names(api.search(text="steuerrecht")) == ["Maria Müller", "Rahul Sharma"]
    assert names(api.search(text="private equity")) == ["Thomas Weber"]
    assert names(api.search(text="Infra Capital")) == ["Thomas Weber"]
    assert names(api.search(text="Finanzdienst")) == ["Priya Nair", "Rahul Sharma"]


def test_country_search_by_german_and_english_name(api: Api, network: dict[str, str]) -> None:
    assert "Rahul Sharma" in names(api.search(text="Singapur"))
    assert "Rahul Sharma" in names(api.search(text="Singapore"))
    assert names(api.search(text="Arabische Emirate")) == ["Rahul Sharma"]


def test_topic_and_interaction_search(api: Api, network: dict[str, str]) -> None:
    assert names(api.search(text="grenzüberschreitende")) == ["Rahul Sharma"]
    api.post(
        "/api/interactions",
        {
            "occurred_on": "2026-03-15",
            "kind": "phone",
            "title": "Telefonat",
            "description": "Europäische Investoren und indische Unternehmen",
            "participant_ids": [network["priya"]],
            "topics": ["Markteintritt Indien"],
        },
        expect=201,
    )
    assert names(api.search(text="europaische investoren")) == ["Priya Nair"]
    assert names(api.search(filters=[{"field": "topic", "values": ["Markteintritt"]}])) == ["Priya Nair"]
    assert names(api.search(filters=[{"field": "topic", "values": ["Investitionen"]}])) == ["Rahul Sharma"]


def test_scenario_b_combined_and_filters(api: Api, network: dict[str, str]) -> None:
    result = api.search(
        filters=[
            {"field": "expertise_country", "values": ["IN"]},
            {"field": "profession", "values": ["Rechtsanwalt"]},
            {"field": "specialization", "values": ["Steuerrecht"]},
        ]
    )
    # "Rechtsanwalt" also matches "Rechtsanwältin" (substring); Priya (Steuerberaterin) and
    # Thomas (no expertise in India) are excluded.
    assert names(result) == ["Maria Müller", "Rahul Sharma"]
    narrowed = api.search(
        filters=[
            {"field": "expertise_country", "values": ["IN"]},
            {"field": "profession", "values": ["Rechtsanwalt"]},
            {"field": "specialization", "values": ["Indisches Steuerrecht"]},
        ]
    )
    assert names(narrowed) == ["Rahul Sharma"]


def test_profession_substring_and_or_filters(api: Api, network: dict[str, str]) -> None:
    lawyers = api.search(filters=[{"field": "profession", "values": ["anw"]}])
    assert names(lawyers) == ["Maria Müller", "Rahul Sharma"]
    either = api.search(
        filters=[
            {"field": "expertise_country", "values": ["IN", "SG"], "match": "any"},
            {"field": "specialization", "values": ["Steuerrecht", "Transfer Pricing"]},
        ]
    )
    assert names(either) == ["Maria Müller", "Priya Nair", "Rahul Sharma"]
    both = api.search(filters=[{"field": "expertise_country", "values": ["IN", "DE"], "match": "all"}])
    assert names(both) == ["Maria Müller"]


def test_all_country_dimensions_and_other_fields(api: Api, network: dict[str, str]) -> None:
    def f(field: str, *values: str) -> list[str]:
        return names(api.search(filters=[{"field": field, "values": list(values)}]))

    assert f("nationality", "IN") == ["Priya Nair", "Rahul Sharma"]
    assert f("residence", "DE") == ["Maria Müller", "Thomas Weber"]
    assert f("activity", "AE") == ["Rahul Sharma"]
    assert f("interest_country", "IN") == ["Thomas Weber"]
    assert f("industry", "Rechtsberatung") == ["Maria Müller", "Rahul Sharma"]
    assert f("organization", "kanzlei") == ["Maria Müller"]
    assert f("tag", "mentor") == ["Maria Müller"]
    assert f("interest", "infra") == ["Thomas Weber"]
    assert f("collaboration", "Indien") == ["Rahul Sharma"]


def test_text_and_filters_combined(api: Api, network: dict[str, str]) -> None:
    result = api.search(text="steuer", filters=[{"field": "residence", "values": ["SG"]}])
    assert names(result) == ["Rahul Sharma"]


def test_date_and_reminder_filters(api: Api, network: dict[str, str]) -> None:
    assert names(api.search(first_met_from="2026-01-01", first_met_to="2026-12-31")) == ["Rahul Sharma"]
    api.post(
        "/api/interactions",
        {"occurred_on": "2026-05-01", "kind": "email", "title": "Mail", "participant_ids": [network["thomas"]]},
        expect=201,
    )
    assert names(api.search(last_interaction_from="2026-04-01")) == ["Thomas Weber"]
    api.post(
        "/api/reminders",
        {"contact_id": network["maria"], "title": "Anrufen", "due_date": "2030-01-01", "timezone": "Europe/Berlin"},
        expect=201,
    )
    assert names(api.search(has_open_reminder=True)) == ["Maria Müller"]


def test_sorting_and_counts(api: Api, network: dict[str, str]) -> None:
    by_name = [i["display_name"] for i in api.search(sort="name")["items"]]
    assert by_name == ["Maria Müller", "Priya Nair", "Rahul Sharma", "Thomas Weber"]  # by last name
    newest = api.search(sort="created")["items"][0]["display_name"]
    assert newest == "Thomas Weber"
    api.post(
        "/api/interactions",
        {"occurred_on": "2026-06-01", "kind": "email", "title": "Mail", "participant_ids": [network["priya"]]},
        expect=201,
    )
    assert api.search(sort="last_interaction")["items"][0]["display_name"] == "Priya Nair"
    page = api.search(limit=2)
    assert page["total"] == 4 and len(page["items"]) == 2


def test_summary_fields(api: Api, network: dict[str, str]) -> None:
    item = api.search(text="rahul")["items"][0]
    assert item["professions"] == ["Rechtsanwalt"]
    assert item["company"] == "Sharma & Partners LLP"
    assert item["residence"] == {"code": "SG", "name": "Singapur"}
    assert item["tags"][:2] == ["Indisches Steuerrecht", "Internationales Steuerrecht"]


def test_special_characters_do_not_break_search(api: Api, network: dict[str, str]) -> None:
    for text in ['"', "%", "_", "a*b", "OR AND NOT", "(", "Sharma & Partners", "' OR 1=1 --"]:
        api.search(text=text)
    assert names(api.search(text="Sharma & Partners")) == ["Rahul Sharma"]


def test_no_ai_dependencies() -> None:
    root = Path(__file__).resolve().parents[1]
    requirements = (root / "requirements.txt").read_text().lower()
    for banned in (
        "openai",
        "anthropic",
        "langchain",
        "transformers",
        "torch",
        "sentence",
        "openrouter",
        "faiss",
        "chroma",
    ):
        assert banned not in requirements
