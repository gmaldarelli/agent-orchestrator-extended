-- +goose Up
-- model_effort is the reasoning/effort tier this session launched with,
-- captured from `ao spawn --model-effort` or resolved project/role config.
-- It is durable so restore does not silently pick a different effort after
-- project config changes. Empty means use resolved config.
-- +goose StatementBegin
ALTER TABLE sessions ADD COLUMN model_effort TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE sessions DROP COLUMN model_effort;
-- +goose StatementEnd
