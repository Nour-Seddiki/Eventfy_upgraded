from app.schemas.ticket import TicketStatus


def test_ticket_status_enum_values():
    assert {status.value for status in TicketStatus} == {"active", "cancelled", "used"}
