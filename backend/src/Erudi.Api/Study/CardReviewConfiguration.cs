using Erudi.Api.Decks;
using Erudi.Api.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Erudi.Api.Study;

internal sealed class CardReviewConfiguration : IEntityTypeConfiguration<CardReview>
{
    public void Configure(EntityTypeBuilder<CardReview> builder)
    {
        builder.Property(r => r.Id).ValueGeneratedNever();
        builder.HasOne<User>().WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Card>().WithMany().HasForeignKey(r => r.CardId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(r => new { r.UserId, r.StudyDay });
    }
}
