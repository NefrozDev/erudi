using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Erudi.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "decks",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            // Existing decks were last changed, at the latest, when they were created.
            migrationBuilder.Sql("UPDATE decks SET updated_at = created_at;");

            migrationBuilder.CreateTable(
                name: "deck_publications",
                columns: table => new
                {
                    deck_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_deck_publications", x => x.deck_id);
                    table.ForeignKey(
                        name: "fk_deck_publications_decks_deck_id",
                        column: x => x.deck_id,
                        principalTable: "decks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "deck_reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    deck_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reporter_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reason = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    details = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    reported_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_deck_reports", x => x.id);
                    table.ForeignKey(
                        name: "fk_deck_reports_decks_deck_id",
                        column: x => x.deck_id,
                        principalTable: "decks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_deck_reports_users_reporter_id",
                        column: x => x.reporter_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "deck_uses",
                columns: table => new
                {
                    deck_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    first_used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    best_score = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_deck_uses", x => new { x.deck_id, x.user_id });
                    table.CheckConstraint("ck_deck_uses_best_score", "best_score BETWEEN 0 AND 100");
                    table.ForeignKey(
                        name: "fk_deck_uses_decks_deck_id",
                        column: x => x.deck_id,
                        principalTable: "decks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_deck_uses_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_deck_reports_deck_id_reporter_id",
                table: "deck_reports",
                columns: new[] { "deck_id", "reporter_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_deck_reports_reporter_id",
                table: "deck_reports",
                column: "reporter_id");

            migrationBuilder.CreateIndex(
                name: "ix_deck_uses_user_id",
                table: "deck_uses",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "deck_publications");

            migrationBuilder.DropTable(
                name: "deck_reports");

            migrationBuilder.DropTable(
                name: "deck_uses");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "decks");
        }
    }
}
