-- +goose Up
-- model is the agent model this session launched with, captured at spawn time
-- (from `ao spawn --model` or the resolved project/role agentConfig.model).
-- It is durable so a daemon restart restores the session on the same model
-- rather than re-resolving project config, which may have changed.
-- Defaulting to '' keeps existing rows valid; '' means use resolved config.
-- +goose StatementBegin
ALTER TABLE sessions ADD COLUMN model TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE sessions DROP COLUMN model;
-- +goose StatementEnd
