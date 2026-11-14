-- Split out of 20261113190335_new: Postgres needs new enum values committed before
-- they can be used (that migration sets DEFAULT 'TEAM' on pages.visibility).
ALTER TYPE "EventLocationType" ADD VALUE 'CONFERIO';
ALTER TYPE "IntegrationProvider" ADD VALUE 'CONFERIO';
ALTER TYPE "PageVisibility" ADD VALUE 'TEAM';
