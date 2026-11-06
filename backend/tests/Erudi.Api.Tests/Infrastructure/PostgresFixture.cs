using Erudi.Api.Tests.Infrastructure;
using Npgsql;
using Testcontainers.PostgreSql;

// xUnit creates assembly fixtures once for the whole test run.
[assembly: AssemblyFixture(typeof(PostgresFixture))]

namespace Erudi.Api.Tests.Infrastructure;

/// <summary>
/// One disposable PostgreSQL server (Docker) for the test run, the same version as production.
/// Each test class gets its own empty database in it, so classes never see each other's rows.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:18-alpine").Build();

    public async ValueTask InitializeAsync() => await container.StartAsync();

    public async ValueTask DisposeAsync() => await container.DisposeAsync();

    public async Task<string> CreateDatabaseAsync()
    {
        var name = $"erudi_test_{Guid.NewGuid():N}";
        await using var connection = new NpgsqlConnection(container.GetConnectionString());
        await connection.OpenAsync();
        // The name is generated above, never user input.
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection);
        await command.ExecuteNonQueryAsync();

        return new NpgsqlConnectionStringBuilder(container.GetConnectionString()) { Database = name }.ConnectionString;
    }
}
