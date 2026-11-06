using System.Text.Encodings.Web;
using Erudi.Api.Mail;
using Erudi.Api.Users;

namespace Erudi.Api.Auth;

public static class PasswordResetMail
{
    public static OutgoingMail Create(User user, string link, TimeSpan validity)
    {
        var minutes = (int)validity.TotalMinutes;
        var name = HtmlEncoder.Default.Encode(user.Username);
        var href = HtmlEncoder.Default.Encode(link);

        var text = $"""
            Bonjour {user.Username},

            Pour choisir un nouveau mot de passe Erudi, ouvre ce lien dans les {minutes} minutes :
            {link}

            Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.
            """;
        var html = $"""
            <p>Bonjour {name},</p>
            <p>Pour choisir un nouveau mot de passe Erudi, ouvre ce lien dans les {minutes} minutes :</p>
            <p><a href="{href}">Choisir un nouveau mot de passe</a></p>
            <p>Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.</p>
            """;

        return new OutgoingMail(user.Email, "Ton nouveau mot de passe Erudi", text, html);
    }
}
