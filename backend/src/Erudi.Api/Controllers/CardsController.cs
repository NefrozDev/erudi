using Erudi.Api.Auth;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Erudi.Api.Controllers;

/// <summary>A single card; cards are listed and added through their deck (<see cref="DecksController"/>).</summary>
[ApiController]
[Authorize]
[Route("api/cards")]
public sealed class CardsController(DeckService decks) : ControllerBase
{
    [HttpGet("{cardId:guid}")]
    [ProducesResponseType<CardResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CardResponse>> Get(Guid cardId, CancellationToken cancellationToken) =>
        await decks.FindCardAsync(User.GetUserId(), cardId, cancellationToken) is { } card ? card : NotFound();

    [HttpPut("{cardId:guid}")]
    [ProducesResponseType<CardResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CardResponse>> Update(Guid cardId, CardRequest request, CancellationToken cancellationToken) =>
        await decks.UpdateCardAsync(User.GetUserId(), cardId, request, cancellationToken) is { } card ? card : NotFound();

    [HttpDelete("{cardId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid cardId, CancellationToken cancellationToken) =>
        await decks.DeleteCardAsync(User.GetUserId(), cardId, cancellationToken) ? NoContent() : NotFound();
}
