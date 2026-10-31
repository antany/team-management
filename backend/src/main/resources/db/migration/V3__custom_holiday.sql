-- Holidays the manager adds on top of the built-in Ontario / federal ones (company days, local closures...).
create table custom_holiday (
    id           uuid primary key,
    user_id      uuid not null references app_user (id) on delete cascade,
    holiday_date date not null,
    name         text not null,
    updated_at   timestamptz not null,
    deleted      boolean not null default false,
    seq          bigint not null
);
create index custom_holiday_user_seq on custom_holiday (user_id, seq);
