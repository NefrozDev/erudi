using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Erudi.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCardReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "card_reviews",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    card_id = table.Column<Guid>(type: "uuid", nullable: true),
                    study_day = table.Column<DateOnly>(type: "date", nullable: false),
                    knew = table.Column<bool>(type: "boolean", nullable: false),
                    from_box = table.Column<int>(type: "integer", nullable: false),
                    to_box = table.Column<int>(type: "integer", nullable: false),
                    reviewed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_card_reviews", x => x.id);
                    table.ForeignKey(
                        name: "fk_card_reviews_cards_card_id",
                        column: x => x.card_id,
                        principalTable: "cards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_card_reviews_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_card_reviews_card_id",
                table: "card_reviews",
                column: "card_id");

            migrationBuilder.CreateIndex(
                name: "ix_card_reviews_user_id_study_day",
                table: "card_reviews",
                columns: new[] { "user_id", "study_day" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "card_reviews");
        }
    }
}
