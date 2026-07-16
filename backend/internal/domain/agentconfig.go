package domain

import "fmt"

// PermissionMode controls how much review an agent requires before acting. It
// lives in domain (not ports) so the typed AgentConfig can carry it; ports
// re-exports it as a type alias so agent adapters keep referring to
// ports.PermissionMode unchanged.
type PermissionMode string

// The permission modes adapters map onto their agent's native approval flags.
const (
	// PermissionModeDefault is special: adapters choose their own baseline
	// behavior for it. Most defer to the agent's own config; some managed
	// adapters may map it to a safer non-interactive default.
	PermissionModeDefault           PermissionMode = "default"
	PermissionModeAcceptEdits       PermissionMode = "accept-edits"
	PermissionModeAuto              PermissionMode = "auto"
	PermissionModeBypassPermissions PermissionMode = "bypass-permissions"
)

// ModelEffort is the provider-neutral reasoning/effort tier AO can carry
// through project config, per-spawn overrides, persistence, and adapters.
type ModelEffort string

// The known model effort tiers. Adapters must either apply the exact tier or
// reject it; they must not silently downgrade to a lower native setting.
const (
	ModelEffortMinimal   ModelEffort = "minimal"
	ModelEffortLow       ModelEffort = "low"
	ModelEffortMedium    ModelEffort = "medium"
	ModelEffortHigh      ModelEffort = "high"
	ModelEffortExtraHigh ModelEffort = "extra-high"
	ModelEffortMax       ModelEffort = "max"
)

// AgentConfig is the typed per-project agent configuration. It replaces the
// former free-form map so the fields are validated and the API/UI render a
// real form rather than arbitrary JSON. An empty value (IsZero) means unset.
type AgentConfig struct {
	// Model overrides the agent's default model (e.g. claude-opus-4-5).
	Model string `json:"model,omitempty"`
	// ModelEffort overrides the agent's default reasoning/effort tier.
	ModelEffort ModelEffort `json:"modelEffort,omitempty" enum:"minimal,low,medium,high,extra-high,max"`
	// Permissions sets the agent's starting permission mode. Empty is treated
	// like the adapter's default mode.
	Permissions PermissionMode `json:"permissions,omitempty"`
}

// IsZero reports whether the config carries no settings, so storage can persist
// SQL NULL and resolution can skip an empty config.
func (c AgentConfig) IsZero() bool {
	return c == AgentConfig{}
}

// Validate rejects values outside the typed vocabulary so a bad config is
// refused when it is set (CLI/API) rather than silently dropped at spawn.
func (c AgentConfig) Validate() error {
	switch c.Permissions {
	case "", PermissionModeDefault, PermissionModeAcceptEdits, PermissionModeAuto, PermissionModeBypassPermissions:
	default:
		return fmt.Errorf("invalid permissions %q: want one of default, accept-edits, auto, bypass-permissions", c.Permissions)
	}
	switch c.ModelEffort {
	case "", ModelEffortMinimal, ModelEffortLow, ModelEffortMedium, ModelEffortHigh, ModelEffortExtraHigh, ModelEffortMax:
		return nil
	default:
		return fmt.Errorf("invalid modelEffort %q: want one of minimal, low, medium, high, extra-high, max", c.ModelEffort)
	}
}

// ValidateForHarness rejects settings that the selected agent harness cannot
// apply. The provider-neutral vocabulary is validated first; an unset effort
// is compatible with every harness.
func (c AgentConfig) ValidateForHarness(h AgentHarness) error {
	if err := c.Validate(); err != nil {
		return err
	}
	if c.ModelEffort == "" {
		return nil
	}
	switch h {
	case HarnessCodex:
		return nil
	case HarnessClaudeCode:
		if c.ModelEffort != ModelEffortMinimal {
			return nil
		}
	}
	return fmt.Errorf("modelEffort %q is not supported for harness %q", c.ModelEffort, h)
}
