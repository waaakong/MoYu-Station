ALTER TABLE sr_chat_message
  ADD COLUMN client_message_id VARCHAR(64) NULL AFTER sender_id,
  ADD UNIQUE KEY uk_chat_sender_client_message (sender_id, client_message_id);
