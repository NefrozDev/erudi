namespace Erudi.Api.Decks;

public static class DeckSetup
{
    public static IServiceCollection AddErudiDecks(this IServiceCollection services) =>
        services.AddScoped<DeckService>();
}
