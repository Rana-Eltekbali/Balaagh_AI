"""Keep report storage private to the direct database backend.

Supabase exposes public-schema tables through its Data API. The application uses
a direct PostgreSQL connection as the table owner, so it needs no client RLS
policies and must retain owner access (no FORCE ROW LEVEL SECURITY).

Downgrading this revision deliberately keeps these protections. An automatic
rollback must not reopen report data; changing access requires an explicit,
separately reviewed administrator grant/policy. Dropping the application tables
via revision 0001 still works for their owner.
"""

from alembic import op

revision = "0002_private_report_tables"
down_revision = "0001_reports"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        return

    # Every identifier is either an explicit application table, a known Supabase
    # client role, or the catalog-resolved sequence owned by one of those tables.
    # Optional roles keep this migration usable on ordinary PostgreSQL as well.
    op.execute(
        """
        DO $private_reports$
        DECLARE
            table_name text;
            client_role text;
            owned_sequence text;
        BEGIN
            FOREACH table_name IN ARRAY ARRAY['reports', 'report_edits', 'alembic_version']
            LOOP
                EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
                EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
                FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated']
                LOOP
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
                        EXECUTE format(
                            'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
                            table_name, client_role
                        );
                    END IF;
                END LOOP;
            END LOOP;

            FOREACH table_name IN ARRAY ARRAY['reports', 'report_edits']
            LOOP
                owned_sequence := pg_get_serial_sequence(format('public.%I', table_name), 'id');
                IF owned_sequence IS NOT NULL THEN
                    EXECUTE format(
                        'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC', owned_sequence
                    );
                    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated']
                    LOOP
                        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
                            EXECUTE format(
                                'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %I',
                                owned_sequence, client_role
                            );
                        END IF;
                    END LOOP;
                END IF;
            END LOOP;
        END;
        $private_reports$;
        """
    )


def downgrade():
    # Security hardening is intentionally retained on rollback; see module docs.
    pass
