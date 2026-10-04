"""Enable row level security on all tables.

The API connects as the tables' owner, which bypasses RLS; enabling it (with no
policies) keeps the tables unreachable through Supabase's public Data API.

Revision ID: 0002
Revises: 0001
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = [
    "users", "subjects", "units", "tags", "resources", "resource_texts", "resource_tags",
    "resource_stars", "resource_ratings", "bookmarks", "resource_views", "reports",
]


def upgrade() -> None:
    for t in TABLES:
        op.execute(f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for t in TABLES:
        op.execute(f'ALTER TABLE "{t}" DISABLE ROW LEVEL SECURITY')
