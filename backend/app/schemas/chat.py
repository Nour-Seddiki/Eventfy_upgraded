from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Body(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    body: str = Field(min_length=1, max_length=2000)


class MessageIn(_Body):
    pass


class SupportStart(_Body):
    topic: Literal["organizer_access", "problem", "other"] = "other"


class AnnouncementIn(_Body):
    pass
