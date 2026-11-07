using Erudi.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Tests.Data;

public sealed class DatabaseTests(ErudiApiFactory factory) : IClassFixture<ErudiApiFactory>
{
    [Fact]
    public async Task Startup_AppliesEveryMigration()
    {
        var pending = await factory.QueryAsync(db => db.Database.GetPendingMigrationsAsync(TestContext.Current.CancellationToken));
        var applied = await factory.QueryAsync(db => db.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken));

        Assert.Empty(pending);
        Assert.Contains(applied, name => name.EndsWith("_CreateAuthTables", StringComparison.Ordinal));
        Assert.Contains(applied, name => name.EndsWith("_AddDecksAndCards", StringComparison.Ordinal));
        Assert.Contains(applied, name => name.EndsWith("_AddCardReviews", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Model_HasNoChangesMissingFromTheMigrations()
    {
        Assert.False(await factory.QueryAsync(db => Task.FromResult(db.Database.HasPendingModelChanges())));
    }
}
