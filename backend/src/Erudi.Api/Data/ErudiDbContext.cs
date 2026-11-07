using Erudi.Api.Auth;
using Erudi.Api.Decks;
using Erudi.Api.Explore;
using Erudi.Api.Study;
using Erudi.Api.Users;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Data;

public sealed class ErudiDbContext(DbContextOptions<ErudiDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<Session> Sessions => Set<Session>();

    public DbSet<PasswordReset> PasswordResets => Set<PasswordReset>();

    public DbSet<Deck> Decks => Set<Deck>();

    public DbSet<Card> Cards => Set<Card>();

    public DbSet<CardReview> CardReviews => Set<CardReview>();

    public DbSet<DeckPublication> DeckPublications => Set<DeckPublication>();

    public DbSet<DeckUse> DeckUses => Set<DeckUse>();

    public DbSet<DeckReport> DeckReports => Set<DeckReport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ErudiDbContext).Assembly);
}
