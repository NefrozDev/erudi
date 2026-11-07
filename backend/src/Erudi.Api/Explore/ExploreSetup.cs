namespace Erudi.Api.Explore;

public static class ExploreSetup
{
    public static IServiceCollection AddErudiExplore(this IServiceCollection services) =>
        services.AddScoped<PublicationService>().AddScoped<ExploreService>();
}
