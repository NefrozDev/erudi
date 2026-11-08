using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Erudi.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SignInWithSynapse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "password_resets");

            migrationBuilder.DropIndex(
                name: "ix_users_normalized_email",
                table: "users");

            migrationBuilder.DropIndex(
                name: "ix_users_normalized_username",
                table: "users");

            migrationBuilder.DropColumn(
                name: "password_hash",
                table: "users");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "terms_accepted_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone");

            migrationBuilder.AddColumn<string>(
                name: "oidc_sid",
                table: "sessions",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_normalized_email",
                table: "users",
                column: "normalized_email");

            migrationBuilder.CreateIndex(
                name: "ix_users_normalized_username",
                table: "users",
                column: "normalized_username");

            migrationBuilder.CreateIndex(
                name: "ix_sessions_oidc_sid",
                table: "sessions",
                column: "oidc_sid");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_users_normalized_email",
                table: "users");

            migrationBuilder.DropIndex(
                name: "ix_users_normalized_username",
                table: "users");

            migrationBuilder.DropIndex(
                name: "ix_sessions_oidc_sid",
                table: "sessions");

            migrationBuilder.DropColumn(
                name: "oidc_sid",
                table: "sessions");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "terms_accepted_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)),
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "password_hash",
                table: "users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "password_resets",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_password_resets", x => x.id);
                    table.ForeignKey(
                        name: "fk_password_resets_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_users_normalized_email",
                table: "users",
                column: "normalized_email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_normalized_username",
                table: "users",
                column: "normalized_username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_password_resets_token_hash",
                table: "password_resets",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_password_resets_user_id",
                table: "password_resets",
                column: "user_id");
        }
    }
}
