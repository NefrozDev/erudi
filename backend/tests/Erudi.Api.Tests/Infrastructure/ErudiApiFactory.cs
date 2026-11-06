using Erudi.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Erudi.Api.Tests.Infrastructure;

/// <summary>The real API in memory, on its own database.</summary>
public sealed class ErudiApiFactory(PostgresFixture postgres) : WebApplicationFactory<Program>, IAsyncLifetime
{
    private string connectionString = "";

    public async ValueTask InitializeAsync() => connectionString = await postgres.CreateDatabaseAsync();

    public async Task<T> QueryAsync<T>(Func<ErudiDbContext, Task<T>> query)
    {
        await using var scope = Services.CreateAsyncScope();
        return await query(scope.ServiceProvider.GetRequiredService<ErudiDbContext>());
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
            new Dictionary<string, string?> { ["ConnectionStrings:Erudi"] = connectionString }));
}
