namespace Erudi.Api.Mail;

public static class MailSetup
{
    public static IServiceCollection AddErudiMail(this IServiceCollection services)
    {
        services.AddOptions<SmtpOptions>()
            .BindConfiguration(SmtpOptions.Section)
            .Validate(o => !o.Enabled || !string.IsNullOrWhiteSpace(o.From), "Smtp:From is required when Smtp:Host is set.")
            .ValidateOnStart();
        services.AddSingleton<ChannelMailQueue>();
        services.AddSingleton<IMailQueue>(provider => provider.GetRequiredService<ChannelMailQueue>());
        services.AddSingleton<IMailSender, SmtpMailSender>();
        services.AddHostedService<MailDispatcher>();

        return services;
    }
}
