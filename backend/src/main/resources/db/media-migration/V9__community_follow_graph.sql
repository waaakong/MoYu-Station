-- Opt-in community data only; no historical row rewrite.
CREATE TABLE sr_follow_collection (
  owner_id BIGINT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_follow_collection_owner FOREIGN KEY(owner_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE sr_user_follow (
  owner_id BIGINT NOT NULL,
  followed_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(owner_id,followed_id),
  CONSTRAINT fk_follow_owner FOREIGN KEY(owner_id) REFERENCES sr_user(id),
  CONSTRAINT fk_follow_target FOREIGN KEY(followed_id) REFERENCES sr_user(id),
  CONSTRAINT ck_follow_not_self CHECK(owner_id<>followed_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_post_timeline ON sr_post(deleted_by_user,deleted_by_admin,created_at,id);
