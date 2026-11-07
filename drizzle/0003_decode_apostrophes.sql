-- The feed writes apostrophes as &#39; (e.g. O&#39;NEILL-STEVENS), which the
-- parser didn't decode. It does now; this fixes names already stored.
UPDATE "candidates" SET "name" = replace("name", '&#39;', '''') WHERE "name" LIKE '%&#39;%';--> statement-breakpoint
UPDATE "parties" SET "name" = replace("name", '&#39;', ''''), "short_name" = replace("short_name", '&#39;', ''''), "abbrev" = replace("abbrev", '&#39;', '''') WHERE "name" LIKE '%&#39;%' OR "short_name" LIKE '%&#39;%' OR "abbrev" LIKE '%&#39;%';--> statement-breakpoint
UPDATE "electorates" SET "name" = replace("name", '&#39;', '''') WHERE "name" LIKE '%&#39;%';
