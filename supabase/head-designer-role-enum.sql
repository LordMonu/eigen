-- EIGEN — enum bootstrap for head_designer
-- Run this FIRST in Supabase SQL Editor.

ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'head_designer';
