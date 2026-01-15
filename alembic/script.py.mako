"""Generic script template for Alembic migrations
This file is consumed by Alembic's `revision` command, and is used
as the template for newly-created migration scripts.
"""

<%!
from alembic import op
import sqlalchemy as sa
%>

"""Auto-generated migration"""

revision = '${up_revision if up_revision else None}'
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}

from alembic import op
import sqlalchemy as sa


def upgrade():
    pass


def downgrade():
    pass
