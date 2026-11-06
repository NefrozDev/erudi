using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Erudi.Api.Data;

public static class DatabaseSetup
{
    public const string ConnectionStringName = "Erudi";

    public static IServiceCollection AddErudiDatabase(this IServiceCollection services) =>
        // The connection string is read when a context is first built, not here, so test
        // hosts can still replace it after Program.cs has registered the services.
        services.AddDbContext<ErudiDbContext>((provider, options) =>
        {
            var connectionString = provider.GetRequiredService<IConfiguration>().GetConnectionString(ConnectionStringName)
                ?? throw new InvalidOperationException($"Missing connection string 'ConnectionStrings:{ConnectionStringName}'.");
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention();
        });

    /// <summary>
    /// Applies pending migrations before the API accepts requests. PostgreSQL runs schema
    /// changes inside the migration's transaction, so a failing one leaves the schema untouched.
    /// </summary>
    public static async Task MigrateDatabaseAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<ErudiDbContext>().Database.MigrateAsync();
    }

    /// <summary>A concurrent write slipped past a duplicate check and hit a unique index.</summary>
    public static bool IsUniqueViolation(this DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
