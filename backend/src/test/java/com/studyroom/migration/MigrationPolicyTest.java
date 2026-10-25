package com.studyroom.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

class MigrationPolicyTest {

    private static final List<String> MIGRATIONS = List.of(
            "db/migration/V1__studyroom_v2_baseline.sql",
            "db/migration/V2__identity_invitation_audit.sql",
            "db/migration/V3__legacy_schema_compatibility.sql",
            "db/migration/V4__chat_message_idempotency.sql",
            "db/media-migration/V5__private_media_assets.sql",
            "db/media-migration/V6__media_publication_references.sql",
            "db/media-migration/V7__private_media_collection.sql",
            "db/media-migration/V8__media_purposes_and_private_collections.sql",
            "db/media-migration/V9__community_follow_graph.sql",
            "db/media-migration/V10__private_scene_derivatives_and_receipts.sql",
            "db/media-migration/V11__private_message_deleted_receipts.sql",
            "db/media-migration/V12__reliable_create_receipts.sql",
            "db/media-migration/V13__client_release_policy_version.sql",
            "db/media-migration/V14__admin_record_versions.sql",
            "db/media-migration/V15__admin_access_versions.sql",
            "db/media-migration/V16__activity_interval_ledger.sql",
            "db/media-migration/V17__relax_page_timing.sql"
    );

    @Test
    void migrationsCannotCreateDropOrSelectADatabase() throws IOException {
        for (String migration : MIGRATIONS) {
            String sql = resource(migration).toUpperCase();
            assertThat(sql)
                    .as(migration)
                    .doesNotContain("CREATE DATABASE")
                    .doesNotContain("DROP DATABASE")
                    .doesNotContain("DROP TABLE")
                    .doesNotContain("TRUNCATE TABLE")
                    .doesNotContain("USE STUDY_ROOM");
        }
    }

    @Test
    void applicationNeverAutomaticallyBaselinesOrCleans() throws IOException {
        String configuration = resource("application.yml");

        assertThat(configuration).contains("baseline-on-migrate: false");
        assertThat(configuration).contains("validate-on-migrate: true");
        assertThat(configuration).contains("clean-disabled: true");
        assertThat(configuration).contains("configure-action: none");
        assertThat(configuration).doesNotContain("classpath:db/media-migration");
    }

    private String resource(String name) throws IOException {
        try (InputStream input = Thread.currentThread().getContextClassLoader().getResourceAsStream(name)) {
            assertThat(input).as("resource %s", name).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
