"use client";

import { useState } from "react";
import { AgentPersona } from "@/types/agentic-session";
import { AVAILABLE_AGENTS, DEFAULT_AGENT_SELECTIONS, groupAgentsByRole } from "@/lib/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Zap, Target, Palette, FileText, Settings } from "lucide-react";

interface AgentSelectionProps {
  selectedAgents: string[];
  onSelectionChange: (selectedAgents: string[]) => void;
  maxAgents?: number;
  disabled?: boolean;
}

const categoryIcons = {
  "Engineering": Users,
  "Design": Palette,
  "Product": Target,
  "Content": FileText,
  "Process & Leadership": Settings
};

export function AgentSelection({
  selectedAgents,
  onSelectionChange,
  maxAgents = 8,
  disabled = false
}: AgentSelectionProps) {
  const [presetType, setPresetType] = useState<keyof typeof DEFAULT_AGENT_SELECTIONS>("BALANCED");

  const agentGroups = groupAgentsByRole();

  const handleAgentToggle = (persona: string) => {
    if (disabled) return;

    const isSelected = selectedAgents.includes(persona);

    if (isSelected) {
      onSelectionChange(selectedAgents.filter(p => p !== persona));
    } else if (selectedAgents.length < maxAgents) {
      onSelectionChange([...selectedAgents, persona]);
    }
  };

  const applyPreset = (type: keyof typeof DEFAULT_AGENT_SELECTIONS) => {
    if (disabled) return;
    setPresetType(type);
    onSelectionChange(DEFAULT_AGENT_SELECTIONS[type]);
  };

  const clearSelection = () => {
    if (disabled) return;
    onSelectionChange([]);
  };

  const selectAll = () => {
    if (disabled) return;
    const allAgents = AVAILABLE_AGENTS.slice(0, maxAgents).map(a => a.persona);
    onSelectionChange(allAgents);
  };

  return (
    <div className="space-y-6">
      {/* Header with selection count and controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Select Agents</h3>
          <p className="text-sm text-muted-foreground">
            Choose agents to participate in this RFE workflow ({selectedAgents.length}/{maxAgents} selected)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearSelection} disabled={disabled}>
            Clear All
          </Button>
          <Button variant="outline" size="sm" onClick={selectAll} disabled={disabled}>
            Select All
          </Button>
        </div>
      </div>

      {/* Preset Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quick Templates
          </CardTitle>
          <CardDescription>
            Apply preset agent combinations for common workflow types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(DEFAULT_AGENT_SELECTIONS).map(([type, agents]) => (
              <Button
                key={type}
                variant={presetType === type ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(type as keyof typeof DEFAULT_AGENT_SELECTIONS)}
                disabled={disabled}
                className="flex flex-col h-auto p-3"
              >
                <span className="font-medium">{type}</span>
                <span className="text-xs opacity-70">{agents.length} agents</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agent Selection by Category */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all">All Agents</TabsTrigger>
          {Object.keys(agentGroups).map(category => (
            <TabsTrigger key={category} value={category.toLowerCase().replace(/\s+/g, '-')}>
              {category.split(' ')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {AVAILABLE_AGENTS.map(agent => (
              <AgentCard
                key={agent.persona}
                agent={agent}
                selected={selectedAgents.includes(agent.persona)}
                onToggle={() => handleAgentToggle(agent.persona)}
                disabled={disabled || (selectedAgents.length >= maxAgents && !selectedAgents.includes(agent.persona))}
              />
            ))}
          </div>
        </TabsContent>

        {Object.entries(agentGroups).map(([category, agents]) => (
          <TabsContent
            key={category}
            value={category.toLowerCase().replace(/\s+/g, '-')}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              {categoryIcons[category as keyof typeof categoryIcons] &&
                React.createElement(categoryIcons[category as keyof typeof categoryIcons], {
                  className: "h-5 w-5"
                })
              }
              <h4 className="font-semibold">{category}</h4>
              <Badge variant="secondary">{agents.length} agents</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {agents.map(agent => (
                <AgentCard
                  key={agent.persona}
                  agent={agent}
                  selected={selectedAgents.includes(agent.persona)}
                  onToggle={() => handleAgentToggle(agent.persona)}
                  disabled={disabled || (selectedAgents.length >= maxAgents && !selectedAgents.includes(agent.persona))}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Selected Agents Summary */}
      {selectedAgents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Agents ({selectedAgents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {selectedAgents.map(persona => {
                const agent = AVAILABLE_AGENTS.find(a => a.persona === persona);
                return agent ? (
                  <Badge
                    key={persona}
                    variant="default"
                    className="flex items-center gap-1 px-3 py-1"
                  >
                    {agent.name}
                    {!disabled && (
                      <button
                        onClick={() => handleAgentToggle(persona)}
                        className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                      >
                        ×
                      </button>
                    )}
                  </Badge>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface AgentCardProps {
  agent: AgentPersona;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function AgentCard({ agent, selected, onToggle, disabled }: AgentCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        selected ? 'ring-2 ring-primary bg-primary/5' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={disabled ? undefined : onToggle}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-sm font-medium">{agent.name}</CardTitle>
            <CardDescription className="text-xs">{agent.role}</CardDescription>
          </div>
          <Checkbox
            checked={selected}
            onChange={onToggle}
            disabled={disabled}
            className="mt-1"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
          {agent.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {agent.expertise.slice(0, 2).map(skill => (
            <Badge key={skill} variant="outline" className="text-xs px-1 py-0">
              {skill.replace(/-/g, ' ')}
            </Badge>
          ))}
          {agent.expertise.length > 2 && (
            <Badge variant="outline" className="text-xs px-1 py-0">
              +{agent.expertise.length - 2}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}