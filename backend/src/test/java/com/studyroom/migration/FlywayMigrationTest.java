package com.studyroom.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class FlywayMigrationTest {

    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.36")
            .withDatabaseName("study_room_migration_test")
            .withUsername("studyroom_test")
            .withPassword("migration-test-only");

    @AfterEach
    void cleanSchema() {
        flyway(false).clean();
    }

    @Test
    void migratesAnEmptyMysql8DatabaseToTheLatestVersion() throws Exception {
        MigrateResult result = flyway(true).migrate();

        assertThat(result.migrationsExecuted).isEqualTo(4);
        assertThat(tableExists("sr_user")).isTrue();
        assertThat(tableExists("sr_invitation")).isTrue();
        assertThat(tableExists("sr_invitation_redemption")).isTrue();
        assertThat(tableExists("sr_admin_audit")).isTrue();
        assertThat(columnExists("sr_user", "force_password_change")).isTrue();
        assertThat(columnExists("sr_user", "password_changed_at")).isTrue();
        assertThat(tableExists("sr_client_update_membership")).isTrue();
        assertThat(tableExists("sr_client_release")).isTrue();
        assertThat(tableExists("sr_client_update_audit")).isTrue();
        assertThat(columnExists("sr_chat_message", "client_message_id")).isTrue();
        assertThat(uniqueIndexExists("sr_chat_message", "uk_chat_sender_client_message")).isTrue();
    }

    @Test
    void runningMigrateTwiceDoesNotReplayVersionedMigrations() {
        assertThat(flyway(true).migrate().migrationsExecuted).isEqualTo(4);

        assertThat(flyway(true).migrate().migrationsExecuted).isZero();
    }

    @Test
    void refusesToAdoptANonEmptyUnversionedDatabase() throws Exception {
        try (Connection connection = connection();
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE legacy_probe (id BIGINT PRIMARY KEY)");
        }

        assertThatThrownBy(() -> flyway(true).migrate())
                .isInstanceOf(FlywayException.class);
    }

    @Test
    void upgradesTheLegacyProductionShapeAfterVersionOneBaseline() throws Exception {
        Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .target("1")
                .cleanDisabled(true)
                .load()
                .migrate();

        try (Connection connection = connection();
             Statement statement = connection.createStatement()) {
            statement.execute("DROP TABLE sr_client_update_audit");
            statement.execute("DROP TABLE sr_client_release");
            statement.execute("DROP TABLE sr_client_update_membership");
            statement.execute("ALTER TABLE sr_chat_message DROP FOREIGN KEY fk_chat_recalled_by");
            statement.execute("ALTER TABLE sr_post_comment DROP FOREIGN KEY fk_comment_reply_user");
            statement.execute("ALTER TABLE sr_focus_record DROP INDEX uk_focus_client_record");
            statement.execute("ALTER TABLE sr_focus_record DROP COLUMN client_record_id, DROP COLUMN actual_seconds");
            statement.execute("ALTER TABLE sr_post DROP INDEX uk_post_client_request");
            statement.execute("ALTER TABLE sr_post DROP COLUMN client_request_id");
        }

        assertThat(flyway(true).migrate().migrationsExecuted).isEqualTo(3);
        assertThat(columnExists("sr_focus_record", "client_record_id")).isTrue();
        assertThat(columnExists("sr_focus_record", "actual_seconds")).isTrue();
        assertThat(columnExists("sr_post", "client_request_id")).isTrue();
        assertThat(tableExists("sr_client_update_membership")).isTrue();
        assertThat(tableExists("sr_client_release")).isTrue();
        assertThat(tableExists("sr_client_update_audit")).isTrue();
        assertThat(columnExists("sr_chat_message", "client_message_id")).isTrue();
    }

    @Test
    void upgradesVersionThreeWithoutBackfillingHistoricalMessages() throws Exception {
        migrateTo("3");
        try (Connection connection = connection();
             Statement statement = connection.createStatement()) {
            insertUsers(statement);
            statement.execute("INSERT INTO sr_chat_message "
                    + "(sender_id, channel_type, message_type, content) "
                    + "VALUES (1, 'HALL', 'TEXT', 'legacy')");
        }

        assertThat(flyway(true).migrate().migrationsExecuted).isEqualTo(1);

        try (Connection connection = connection();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(
                     "SELECT client_message_id FROM sr_chat_message WHERE content = 'legacy'")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getString("client_message_id")).isNull();
        }
    }

    @Test
    void enforcesSenderScopedClientMessageIdsWhileAllowingLegacyNulls() throws Exception {
        flyway(true).migrate();
        String clientMessageId = "11111111-1111-4111-8111-111111111111";
        try (Connection connection = connection();
             Statement statement = connection.createStatement()) {
            insertUsers(statement);
            statement.execute("INSERT INTO sr_chat_message "
                    + "(sender_id, client_message_id, channel_type, message_type, content) "
                    + "VALUES (1, '" + clientMessageId + "', 'HALL', 'TEXT', 'first')");

            assertThatThrownBy(() -> statement.execute("INSERT INTO sr_chat_message "
                    + "(sender_id, client_message_id, channel_type, message_type, content) "
                    + "VALUES (1, '" + clientMessageId + "', 'HALL', 'TEXT', 'duplicate')"))
                    .isInstanceOf(SQLException.class);

            statement.execute("INSERT INTO sr_chat_message "
                    + "(sender_id, client_message_id, channel_type, message_type, content) "
                    + "VALUES (2, '" + clientMessageId + "', 'HALL', 'TEXT', 'other sender')");
            statement.execute("INSERT INTO sr_chat_message "
                    + "(sender_id, channel_type, message_type, content) "
                    + "VALUES (1, 'HALL', 'TEXT', 'legacy one'), (1, 'HALL', 'TEXT', 'legacy two')");
        }

        assertThat(rowCount("sr_chat_message")).isEqualTo(4);
    }

    private void migrateTo(String version) {
        Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .target(version)
                .cleanDisabled(true)
                .load()
                .migrate();
    }

    private void insertUsers(Statement statement) throws SQLException {
        statement.execute("INSERT INTO sr_user (id, username, password_hash, nickname) VALUES "
                + "(1, 'sender-one', 'test-only', 'Sender One'), "
                + "(2, 'sender-two', 'test-only', 'Sender Two')");
    }

    private Flyway flyway(boolean cleanDisabled) {
        return Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(false)
                .validateOnMigrate(true)
                .cleanDisabled(cleanDisabled)
                .load();
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
    }

    private boolean tableExists(String tableName) throws Exception {
        try (Connection connection = connection()) {
            DatabaseMetaData metadata = connection.getMetaData();
            try (ResultSet result = metadata.getTables(connection.getCatalog(), null, tableName, new String[] {"TABLE"})) {
                return result.next();
            }
        }
    }

    private boolean columnExists(String tableName, String columnName) throws Exception {
        try (Connection connection = connection()) {
            DatabaseMetaData metadata = connection.getMetaData();
            try (ResultSet result = metadata.getColumns(connection.getCatalog(), null, tableName, columnName)) {
                return result.next();
            }
        }
    }

    private boolean uniqueIndexExists(String tableName, String indexName) throws Exception {
        try (Connection connection = connection()) {
            DatabaseMetaData metadata = connection.getMetaData();
            try (ResultSet result = metadata.getIndexInfo(connection.getCatalog(), null, tableName, true, false)) {
                while (result.next()) {
                    if (indexName.equalsIgnoreCase(result.getString("INDEX_NAME"))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private long rowCount(String tableName) throws Exception {
        try (Connection connection = connection();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM " + tableName)) {
            assertThat(result.next()).isTrue();
            return result.getLong(1);
        }
    }
}
