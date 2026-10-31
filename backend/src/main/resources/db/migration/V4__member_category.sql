-- Team a member belongs to (DEV, BSA, QA, ENGINEER); empty = none.
alter table team_member add column category text not null default '';
