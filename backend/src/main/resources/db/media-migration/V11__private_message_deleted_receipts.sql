-- Opt-in on an isolated copy first. No historical content is rewritten or removed.
CREATE TABLE sr_chat_deleted_receipt (
  message_id BIGINT PRIMARY KEY,
  sender_id BIGINT NOT NULL,
  receiver_id BIGINT NOT NULL,
  client_message_id VARCHAR(64) NULL,
  deleted_at_ms BIGINT NOT NULL,
  UNIQUE KEY uk_chat_deleted_sender_client(sender_id, client_message_id),
  CONSTRAINT ck_chat_deleted_participants CHECK(sender_id <> receiver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
