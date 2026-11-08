using Erudi.Api.Data;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace Erudi.Api.Tests.Infrastructure;

/// <summary>
/// The real API in memory, on its own database. The clock is replaced so tests can move time
/// forward, and the Synapse identity service by <see cref="FakeIdentityProvider"/>.
/// </summary>
public sealed class ErudiApiFactory(PostgresFixture postgres) : WebApplicationFactory<Program>, IAsyncLifetime
{
    private string connectionString = "";

    /// <summary>Whole seconds: PostgreSQL keeps microseconds, so stored times compare equal.</summary>
    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 6, 12, 0, 0, TimeSpan.Zero));

    public FakeIdentityProvider Identity { get; } = new();

    public async ValueTask InitializeAsync() => connectionString = await postgres.CreateDatabaseAsync();

    public async Task<T> QueryAsync<T>(Func<ErudiDbContext, Task<T>> query)
    {
        await using var scope = Services.CreateAsyncScope();
        return await query(scope.ServiceProvider.GetRequiredService<ErudiDbContext>());
    }

    /// <summary>A client that does not keep cookies, to send hand-made ones.</summary>
    public HttpClient CreateClientWithoutCookies() =>
        CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:Erudi"] = connectionString,
                // Tests sign in far more often than a person; RequestProtectionTests lowers it again.
                ["Auth:RateLimitPerMinute"] = "10000",
                ["Identity:Issuer"] = FakeIdentityProvider.Issuer,
                ["Identity:ClientId"] = FakeIdentityProvider.ClientId,
                ["Identity:ClientSecret"] = FakeIdentityProvider.ClientSecret,
            }));
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(Clock);
            // Registered after the handler's own post-configuration, so these win.
            services.PostConfigure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, options =>
            {
                options.Configuration = Identity.Configuration;
                options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(Identity.Configuration);
                options.Backchannel = new HttpClient(Identity, disposeHandler: false);
                // The sign-in cookies and the signed tokens live in real time: on the fake clock
                // the cookies would already be expired for the client's cookie jar.
                options.TimeProvider = TimeProvider.System;
            });
        });
    }
}
