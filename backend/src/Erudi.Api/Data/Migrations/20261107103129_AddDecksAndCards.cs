using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Erudi.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDecksAndCards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "decks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_decks", x => x.id);
                    table.ForeignKey(
                        name: "fk_decks_users_owner_id",
                        column: x => x.owner_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "cards",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    deck_id = table.Column<Guid>(type: "uuid", nullable: false),
                    front = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    back = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    box = table.Column<int>(type: "integer", nullable: false),
                    due_on = table.Column<DateOnly>(type: "date", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cards", x => x.id);
                    table.CheckConstraint("ck_cards_box", "box BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "fk_cards_decks_deck_id",
                        column: x => x.deck_id,
                        principalTable: "decks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_cards_deck_id_due_on",
                table: "cards",
                columns: new[] { "deck_id", "due_on" });

            migrationBuilder.CreateIndex(
                name: "ix_decks_owner_id",
                table: "decks",
                column: "owner_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cards");

            migrationBuilder.DropTable(
                name: "decks");
        }
    }
}
