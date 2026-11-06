using Erudi.Api.Auth;
using Erudi.Api.Users;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Data;

public sealed class ErudiDbContext(DbContextOptions<ErudiDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<Session> Sessions => Set<Session>();

    public DbSet<PasswordReset> PasswordResets => Set<PasswordReset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ErudiDbContext).Assembly);
}
