using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Validation;

/// <summary>A checkbox that has to be ticked, such as accepting the terms of use.</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class MustBeTrueAttribute() : ValidationAttribute("The {0} field must be accepted.")
{
    public override bool IsValid(object? value) => value is true;
}
