create table app_user (
    id            uuid primary key,
    username      text not null,
    password_hash text not null,
    display_name  text not null,
    created_at    timestamptz not null default now()
);
create unique index app_user_username_lower on app_user (lower(username));

-- Every synced write takes the next value; clients pull "seq > cursor".
create sequence change_seq;

create table team_member (
    id         uuid primary key,
    user_id    uuid not null references app_user (id) on delete cascade,
    name       text not null,
    title      text not null default '',
    start_date date,
    about      text not null default '',
    archived   boolean not null default false,
    updated_at timestamptz not null,
    deleted    boolean not null default false,
    seq        bigint not null
);
create index team_member_user_seq on team_member (user_id, seq);

create table leave_entry (
    id         uuid primary key,
    user_id    uuid not null references app_user (id) on delete cascade,
    member_id  uuid not null,
    start_date date not null,
    end_date   date not null,
    type       text not null,
    note       text not null default '',
    updated_at timestamptz not null,
    deleted    boolean not null default false,
    seq        bigint not null,
    check (end_date >= start_date)
);
create index leave_entry_user_seq on leave_entry (user_id, seq);

create table allocation (
    id         uuid primary key,
    user_id    uuid not null references app_user (id) on delete cascade,
    member_id  uuid not null,
    project    text not null,
    percent    integer not null check (percent between 0 and 200),
    start_date date not null,
    end_date   date,
    note       text not null default '',
    updated_at timestamptz not null,
    deleted    boolean not null default false,
    seq        bigint not null
);
create index allocation_user_seq on allocation (user_id, seq);

create table member_note (
    id             uuid primary key,
    user_id        uuid not null references app_user (id) on delete cascade,
    member_id      uuid not null,
    category       text not null,
    body           text not null,
    note_date      date not null,
    follow_up_date date,
    done           boolean not null default false,
    updated_at     timestamptz not null,
    deleted        boolean not null default false,
    seq            bigint not null
);
create index member_note_user_seq on member_note (user_id, seq);
