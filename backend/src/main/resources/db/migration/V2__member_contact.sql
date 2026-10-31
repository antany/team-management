-- Contact details for a team member (all optional, free text).
alter table team_member add column email text not null default '';
alter table team_member add column phone text not null default '';
alter table team_member add column emergency_contact text not null default '';
