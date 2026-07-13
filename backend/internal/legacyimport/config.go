package legacyimport

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	yaml "gopkg.in/yaml.v3"
)

// legacyConfig is the subset of the legacy global config.yaml the importer
// reads: the projects registry keyed by project id. Unknown top-level keys
// (notifiers, power, plugins, …) are intentionally ignored — they have no home
// in the rewrite schema (issue #247 §4).
type legacyConfig struct {
	Projects map[string]legacyProjectConfig `yaml:"projects"`
}

// legacyProjectConfig is one project's block. Prompt rule fields stay raw so
// scalar strings can be copied while non-string legacy values are reported as
// dropped; fields with no rewrite home are also captured as raw nodes purely for
// dropped-field notes (issue #247 §4).
type legacyProjectConfig struct {
	Path string `yaml:"path"`
	Name string `yaml:"name"`
	// Repo is captured as a raw YAML node but never consumed; the origin URL is
	// re-resolved from the repo path at import time.
	Repo             *yaml.Node         `yaml:"repo"`
	DefaultBranch    string             `yaml:"defaultBranch"`
	SessionPrefix    string             `yaml:"sessionPrefix"`
	Env              map[string]string  `yaml:"env"`
	Symlinks         []string           `yaml:"symlinks"`
	PostCreate       []string           `yaml:"postCreate"`
	AgentConfig      *legacyAgentConfig `yaml:"agentConfig"`
	Worker           *legacyRole        `yaml:"worker"`
	Orchestrator     *legacyRole        `yaml:"orchestrator"`
	AgentRules       *yaml.Node         `yaml:"agentRules"`
	AgentRulesFile   *yaml.Node         `yaml:"agentRulesFile"`
	OrchestratorRule *yaml.Node         `yaml:"orchestratorRules"`

	// Captured only to surface as dropped in the report (no rewrite home).
	Tracker   *yaml.Node `yaml:"tracker"`
	SCM       *yaml.Node `yaml:"scm"`
	Runtime   *yaml.Node `yaml:"runtime"`
	Workspace *yaml.Node `yaml:"workspace"`
	Reactions *yaml.Node `yaml:"reactions"`
}

type legacyAgentConfig struct {
	Model       string `yaml:"model"`
	Permissions string `yaml:"permissions"`
}

type legacyRole struct {
	Agent       string             `yaml:"agent"`
	AgentConfig *legacyAgentConfig `yaml:"agentConfig"`
}

// loadLegacyConfig reads and parses root/config.yaml. A missing file is not an
// error — it yields an empty registry so the caller reports "nothing to import".
func loadLegacyConfig(root string) (legacyConfig, error) {
	data, err := os.ReadFile(globalConfigPath(root))
	if os.IsNotExist(err) {
		return legacyConfig{}, nil
	}
	if err != nil {
		return legacyConfig{}, fmt.Errorf("read legacy config: %w", err)
	}
	var cfg legacyConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		var typeErr *yaml.TypeError
		if !errors.As(err, &typeErr) {
			return legacyConfig{}, fmt.Errorf("parse legacy config.yaml: %w", err)
		}
		// A type mismatch (e.g. a scalar where a mapping is expected) is a
		// partial decode: keep the decoded fields and continue.
	}

	// Second-pass: validate per-project keys using KnownFields(true) so
	// misspelled or misplaced project-level keys are caught. Top-level unknown
	// keys (notifiers, power, plugins, …) remain intentionally tolerated.
	if err := validateProjectKeys(data); err != nil {
		return legacyConfig{}, err
	}

	return cfg, nil
}

// validateProjectKeys decodes only the per-project blocks with KnownFields(true)
// to surface misspelled or unknown project keys. Type errors are tolerated (they
// are already handled by the first-pass Unmarshal above); only "field not found"
// errors from KnownFields propagate.
func validateProjectKeys(data []byte) error {
	// Extract raw per-project nodes without strict validation at the top level.
	var raw struct {
		Projects map[string]yaml.Node `yaml:"projects"`
	}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil // parse failure already handled by caller
	}

	var errs []string
	for id, node := range raw.Projects {
		nodeData, marshalErr := yaml.Marshal(&node)
		if marshalErr != nil {
			continue
		}
		dec := yaml.NewDecoder(bytes.NewReader(nodeData))
		dec.KnownFields(true)
		var pc legacyProjectConfig
		if decErr := dec.Decode(&pc); decErr != nil {
			var typeErr *yaml.TypeError
			if errors.As(decErr, &typeErr) {
				// Tolerate type mismatches (handled by the first-pass decode).
				continue
			}
			errs = append(errs, fmt.Sprintf("project %q: %v", id, decErr))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("legacy config.yaml: unknown project keys: %w", errors.New(strings.Join(errs, "; ")))
	}
	return nil
}

// ValidateConfigSchema reads root/config.yaml and returns an error if any
// per-project block contains unknown or misspelled keys. A missing config file
// is not an error. This is intentionally limited to project blocks — top-level
// unknown keys (notifiers, power, plugins, …) are tolerated by design.
func ValidateConfigSchema(root string) error {
	data, err := os.ReadFile(globalConfigPath(root))
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read legacy config: %w", err)
	}
	return validateProjectKeys(data)
}

// preferences is the portfolio/preferences.json overlay: only per-project
// display names survive into the rewrite (issue #247 §1).
type preferences struct {
	Projects map[string]struct {
		DisplayName string `json:"displayName"`
	} `json:"projects"`
}

func loadPreferences(root string) preferences {
	var p preferences
	data, err := os.ReadFile(preferencesPath(root))
	if err != nil {
		return p
	}
	_ = json.Unmarshal(data, &p) // best-effort overlay; a damaged file is ignored
	return p
}

// registeredManifest is the portfolio/registered.json overlay: it carries each
// project's addedAt, the best available registered_at provenance (issue #247 §1,
// G10). The legacy shape is a list of {id|path, addedAt} records.
type registeredManifest struct {
	Projects []struct {
		ID      string `json:"id"`
		Path    string `json:"path"`
		AddedAt string `json:"addedAt"`
	} `json:"projects"`
}

func loadRegistered(root string) registeredManifest {
	var m registeredManifest
	data, err := os.ReadFile(registeredPath(root))
	if err != nil {
		return m
	}
	_ = json.Unmarshal(data, &m)
	return m
}

// addedAt returns the registration timestamp for a project, matching first by
// id then by path. "" when the manifest has no record.
func (m registeredManifest) addedAt(id, path string) string {
	for _, p := range m.Projects {
		if p.ID == id && p.AddedAt != "" {
			return p.AddedAt
		}
	}
	for _, p := range m.Projects {
		if p.Path == path && p.AddedAt != "" {
			return p.AddedAt
		}
	}
	return ""
}
