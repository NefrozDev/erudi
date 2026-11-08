using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Erudi.Api.Auth;

internal sealed class SessionConfiguration : IEntityTypeConfiguration<Session>
{
    public void Configure(EntityTypeBuilder<Session> builder)
    {
        builder.Property(s => s.Id).ValueGeneratedNever();
        builder.Property(s => s.TokenHash).HasMaxLength(SecureTokens.HashLength);
        builder.Property(s => s.OidcSid).HasMaxLength(Session.OidcSidMaxLength);
        builder.HasIndex(s => s.TokenHash).IsUnique();
        builder.HasIndex(s => s.ExpiresAt);
        builder.HasIndex(s => s.OidcSid);
        builder.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
