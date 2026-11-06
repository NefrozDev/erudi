using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Erudi.Api.Users;

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.Property(u => u.Id).ValueGeneratedNever();
        builder.Property(u => u.Username).HasMaxLength(UserRules.UsernameMaxLength);
        builder.Property(u => u.NormalizedUsername).HasMaxLength(UserRules.UsernameMaxLength);
        builder.Property(u => u.Email).HasMaxLength(UserRules.EmailMaxLength);
        builder.Property(u => u.NormalizedEmail).HasMaxLength(UserRules.EmailMaxLength);
        builder.Property(u => u.Locale).HasMaxLength(UserRules.LocaleMaxLength);

        builder.HasIndex(u => u.NormalizedUsername).IsUnique();
        builder.HasIndex(u => u.NormalizedEmail).IsUnique();
    }
}
