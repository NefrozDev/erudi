using Microsoft.AspNetCore.HttpOverrides;
using IPNetwork = System.Net.IPNetwork;

namespace Erudi.Api.Security;

public static class SecuritySetup
{
    // Docker networks and loopback. Public addresses in X-Forwarded-For are never trusted,
    // so a client cannot pick its own IP to escape the rate limiter.
    private static readonly string[] PrivateNetworks =
        ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "::1/128", "fc00::/7"];

    public static IServiceCollection AddErudiSecurity(this IServiceCollection services)
    {
        services.AddOptions<FrontendOptions>()
            .BindConfiguration(FrontendOptions.Section)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // In production a request goes through Mailcow's nginx, then the web container's proxy.
            options.ForwardLimit = 2;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var network in PrivateNetworks)
            {
                options.KnownIPNetworks.Add(IPNetwork.Parse(network));
            }
        });

        return services;
    }
}
