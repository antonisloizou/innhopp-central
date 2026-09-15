BEGIN;

ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS notes TEXT;

WITH legacy_values (id, jump_count, years_in_sport, notes) AS (
  VALUES
    (1, NULL, NULL, 'Legacy: 2200 jumps, AFF-I, Rigger, Coach'),
    (2, NULL, NULL, 'Legacy: 10000+ jumps; founder The Innhopp Project'),
    (3, 1100, NULL, 'AFF-I'),
    (4, 8000, NULL, NULL),
    (5, 400, NULL, NULL),
    (6, 295, NULL, NULL),
    (7, 300, NULL, 'Expect 500 by the time of Innhopp'),
    (9, 60, NULL, NULL),
    (10, NULL, NULL, '>500'),
    (11, 625, NULL, NULL),
    (12, 550, NULL, NULL),
    (13, NULL, NULL, 'Legacy jump count: 650'),
    (14, 1550, NULL, NULL),
    (15, 1800, NULL, NULL),
    (16, 390, NULL, NULL),
    (21, 10000, NULL, NULL),
    (22, 6000, NULL, NULL),
    (24, NULL, NULL, 'Ground crew 1 Head of logistics/Controller'),
    (25, NULL, NULL, 'Packer/Driver'),
    (26, NULL, NULL, 'Pilot'),
    (27, NULL, NULL, 'Driver -7'),
    (30, NULL, NULL, 'Legacy jump count: 1000+'),
    (31, NULL, NULL, 'Ground crew 2 Driver/packer'),
    (32, 2395, NULL, NULL),
    (33, 600, NULL, NULL),
    (34, 57, NULL, NULL),
    (35, NULL, NULL, 'Legacy jump count: 491'),
    (36, NULL, NULL, 'Legacy jump count: 600'),
    (37, 191, NULL, NULL),
    (38, 1750, NULL, NULL),
    (39, NULL, NULL, '700-ish'),
    (40, 225, NULL, NULL),
    (41, NULL, NULL, 'Legacy jump count: 1200+'),
    (42, 3315, NULL, NULL),
    (43, 5600, NULL, NULL),
    (44, 180, NULL, NULL),
    (46, 800, NULL, NULL),
    (47, 3000, NULL, NULL),
    (48, 1500, NULL, NULL),
    (49, 578, NULL, NULL),
    (50, 3800, NULL, NULL),
    (52, NULL, NULL, 'Legacy jump count: 2100'),
    (53, NULL, NULL, 'Pilot'),
    (54, NULL, NULL, 'Skydive Xielo'),
    (55, NULL, NULL, 'Packer'),
    (56, NULL, NULL, 'Packer'),
    (57, NULL, NULL, 'Cessna - EPIC'),
    (99, 200, NULL, NULL),
    (137, 206, 2, NULL),
    (138, 860, 6, NULL),
    (139, 414, 3, NULL),
    (151, NULL, NULL, 'Legacy: 477 jumps / 18 years'),
    (152, 686, 4, NULL),
    (154, 1900, 10, NULL),
    (156, 354, 18, NULL),
    (157, NULL, NULL, 'Legacy jump count: 1350'),
    (158, NULL, NULL, 'Legacy jump count: 130'),
    (159, 1476, 9, NULL),
    (160, 1503, 19, NULL),
    (217, NULL, NULL, 'Tnadem Instructor')
)
UPDATE participant_profiles AS profile
SET
  jump_count = COALESCE(profile.jump_count, legacy_values.jump_count),
  years_in_sport = COALESCE(profile.years_in_sport, legacy_values.years_in_sport),
  notes = legacy_values.notes,
  experience_level = NULL
FROM legacy_values
WHERE profile.id = legacy_values.id;

UPDATE participant_profiles
SET experience_level = NULL
WHERE experience_level IS NOT NULL
  AND length(BTRIM(experience_level)) = 0;

COMMIT;
