package domain

import (
	"fmt"
	"testing"
)

func TestAgentConfigValidateForHarness(t *testing.T) {
	tests := []struct {
		name    string
		config  AgentConfig
		harness AgentHarness
		wantErr string
	}{
		{name: "empty effort is accepted for unknown harness", harness: "future-agent"},
		{name: "codex minimal", config: AgentConfig{ModelEffort: ModelEffortMinimal}, harness: HarnessCodex},
		{name: "codex low", config: AgentConfig{ModelEffort: ModelEffortLow}, harness: HarnessCodex},
		{name: "codex medium", config: AgentConfig{ModelEffort: ModelEffortMedium}, harness: HarnessCodex},
		{name: "codex high", config: AgentConfig{ModelEffort: ModelEffortHigh}, harness: HarnessCodex},
		{name: "codex extra high", config: AgentConfig{ModelEffort: ModelEffortExtraHigh}, harness: HarnessCodex},
		{name: "codex max", config: AgentConfig{ModelEffort: ModelEffortMax}, harness: HarnessCodex},
		{name: "claude code low", config: AgentConfig{ModelEffort: ModelEffortLow}, harness: HarnessClaudeCode},
		{
			name:    "claude code minimal",
			config:  AgentConfig{ModelEffort: ModelEffortMinimal},
			harness: HarnessClaudeCode,
			wantErr: `modelEffort "minimal" is not supported for harness "claude-code"`,
		},
		{
			name:    "agy high",
			config:  AgentConfig{ModelEffort: ModelEffortHigh},
			harness: HarnessAgy,
			wantErr: `modelEffort "high" is not supported for harness "agy"`,
		},
		{
			name:    "other harness max",
			config:  AgentConfig{ModelEffort: ModelEffortMax},
			harness: HarnessOpenCode,
			wantErr: `modelEffort "max" is not supported for harness "opencode"`,
		},
		{
			name:    "invalid effort is a vocabulary error",
			config:  AgentConfig{ModelEffort: "extreme"},
			harness: HarnessCodex,
			wantErr: `invalid modelEffort "extreme": want one of minimal, low, medium, high, extra-high, max`,
		},
		{
			name:    "invalid permissions are validated first",
			config:  AgentConfig{Permissions: "yolo"},
			harness: HarnessCodex,
			wantErr: `invalid permissions "yolo": want one of default, accept-edits, auto, bypass-permissions`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.ValidateForHarness(tt.harness)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateForHarness() error = %v", err)
				}
				return
			}
			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("ValidateForHarness() error = %v, want %q", err, tt.wantErr)
			}
		})
	}
}

func TestAgentConfigValidateForHarnessRejectsEffortForOtherHarnesses(t *testing.T) {
	for _, harness := range AllHarnesses {
		if harness == HarnessCodex || harness == HarnessClaudeCode {
			continue
		}
		t.Run(string(harness), func(t *testing.T) {
			err := (AgentConfig{ModelEffort: ModelEffortHigh}).ValidateForHarness(harness)
			want := fmt.Sprintf(`modelEffort "high" is not supported for harness %q`, harness)
			if err == nil || err.Error() != want {
				t.Fatalf("ValidateForHarness() error = %v, want %q", err, want)
			}
		})
	}
}
