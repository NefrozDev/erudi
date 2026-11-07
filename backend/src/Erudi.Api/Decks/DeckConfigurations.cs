using Erudi.Api.Study;
using Erudi.Api.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Erudi.Api.Decks;

internal sealed class DeckConfiguration : IEntityTypeConfiguration<Deck>
{
    public void Configure(EntityTypeBuilder<Deck> builder)
    {
        builder.Property(d => d.Id).ValueGeneratedNever();
        builder.Property(d => d.Name).HasMaxLength(DeckRules.NameMaxLength);
        builder.HasOne<User>().WithMany().HasForeignKey(d => d.OwnerId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class CardConfiguration : IEntityTypeConfiguration<Card>
{
    public void Configure(EntityTypeBuilder<Card> builder)
    {
        builder.ToTable(table => table.HasCheckConstraint(
            "ck_cards_box",
            $"box BETWEEN {LeitnerSchedule.FirstBox} AND {LeitnerSchedule.LastBox}"));

        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.Front).HasMaxLength(DeckRules.CardSideMaxLength);
        builder.Property(c => c.Back).HasMaxLength(DeckRules.CardSideMaxLength);
        builder.HasOne(c => c.Deck).WithMany(d => d.Cards).HasForeignKey(c => c.DeckId).OnDelete(DeleteBehavior.Cascade);

        // Serves both a deck's card list and its due cards.
        builder.HasIndex(c => new { c.DeckId, c.DueOn });
    }
}
