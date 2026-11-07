using Erudi.Api.Decks;
using Erudi.Api.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Erudi.Api.Explore;

// The services write these tables with upserts in SQL (INSERT … ON CONFLICT): keep the table
// and column names there in step with this model. The endpoint tests cover each statement.

internal sealed class DeckPublicationConfiguration : IEntityTypeConfiguration<DeckPublication>
{
    public void Configure(EntityTypeBuilder<DeckPublication> builder)
    {
        builder.HasKey(p => p.DeckId);
        builder.HasOne(p => p.Deck)
            .WithOne(d => d.Publication)
            .HasForeignKey<DeckPublication>(p => p.DeckId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(p => p.Title).HasMaxLength(ExploreRules.TitleMaxLength);
        builder.Property(p => p.Category).HasConversion<string>().HasMaxLength(ExploreRules.EnumNameMaxLength);
        builder.Property(p => p.Description).HasMaxLength(ExploreRules.DescriptionMaxLength);
    }
}

internal sealed class DeckUseConfiguration : IEntityTypeConfiguration<DeckUse>
{
    public void Configure(EntityTypeBuilder<DeckUse> builder)
    {
        builder.ToTable(table => table.HasCheckConstraint("ck_deck_uses_best_score", "best_score BETWEEN 0 AND 100"));

        builder.HasKey(u => new { u.DeckId, u.UserId });
        builder.HasOne<Deck>().WithMany().HasForeignKey(u => u.DeckId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<User>().WithMany().HasForeignKey(u => u.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class DeckReportConfiguration : IEntityTypeConfiguration<DeckReport>
{
    public void Configure(EntityTypeBuilder<DeckReport> builder)
    {
        builder.Property(r => r.Id).ValueGeneratedNever();
        builder.Property(r => r.Reason).HasConversion<string>().HasMaxLength(ExploreRules.EnumNameMaxLength);
        builder.Property(r => r.Details).HasMaxLength(ExploreRules.ReportDetailsMaxLength);
        builder.HasOne<Deck>().WithMany().HasForeignKey(r => r.DeckId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<User>().WithMany().HasForeignKey(r => r.ReporterId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(r => new { r.DeckId, r.ReporterId }).IsUnique();
    }
}
