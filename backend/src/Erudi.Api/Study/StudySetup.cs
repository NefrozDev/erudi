namespace Erudi.Api.Study;

public static class StudySetup
{
    public static IServiceCollection AddErudiStudy(this IServiceCollection services)
    {
        // StudyCalendar reads the learner's time zone from the current request.
        services.AddHttpContextAccessor();
        services.AddScoped<StudyCalendar>();
        services.AddScoped<StudyService>();

        return services;
    }
}
