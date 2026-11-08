using Erudi.Api.Auth;
using Erudi.Api.Data;
using Erudi.Api.Decks;
using Erudi.Api.Explore;
using Erudi.Api.Security;
using Erudi.Api.Study;
using Microsoft.AspNetCore.Mvc.ModelBinding.Metadata;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers(options =>
    // Validation errors are keyed by JSON names ("username"), the ones the frontend sends.
    options.ModelMetadataDetailsProviders.Add(new SystemTextJsonValidationMetadataProvider()));
builder.Services.AddOpenApi();
// Errors are returned as RFC 9457 problem details instead of empty bodies or stack traces.
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddErudiDatabase();
builder.Services.AddErudiSecurity();
builder.Services.AddErudiAuth();
builder.Services.AddErudiStudy();
builder.Services.AddErudiDecks();
builder.Services.AddErudiExplore();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// No HTTPS redirection or HSTS here: in production Mailcow's nginx terminates HTTPS and
// redirects plain HTTP, and the web container adds HSTS to every answer (deploy/).

app.UseMiddleware<AllowedOriginMiddleware>();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapHealthChecks("/api/health");
app.MapControllers();

await app.MigrateDatabaseAsync();
await app.RunAsync();
