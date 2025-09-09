import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { 
  Users, 
  CheckCircle, 
  Loader2,
  AlertCircle,
  User,
  Code,
  Building2,
  Palette,
  Search,
  Target,
  UserCheck
} from "lucide-react";
import React from "react";

const AGENT_ICONS = {
  PM: Target,
  PRODUCT_OWNER: UserCheck,
  ARCHITECT: Building2,
  BACKEND_ENG: Code,
  FRONTEND_ENG: Code,
  UXD: Palette,
  SME_RESEARCHER: Search,
};

function AgentModal({ agent, isOpen, onClose }) {
  if (!agent || !agent.result) return null;

  const { result } = agent;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {AGENT_ICONS[agent.agent_key] && 
              React.createElement(AGENT_ICONS[agent.agent_key], {
                className: "h-5 w-5"
              })
            }
            {agent.agent_name} Analysis
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Analysis */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Analysis</h3>
              <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                {result.analysis}
              </div>
            </div>

            {/* Complexity */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Estimated Complexity</h3>
              <Badge variant={
                result.estimatedComplexity === 'LOW' ? 'default' : 
                result.estimatedComplexity === 'MEDIUM' ? 'secondary' : 
                result.estimatedComplexity === 'HIGH' ? 'destructive' : 'outline'
              }>
                {result.estimatedComplexity}
              </Badge>
            </div>

            {/* Concerns */}
            {result.concerns && result.concerns.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Concerns</h3>
                <ul className="space-y-1">
                  {result.concerns.map((concern, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      {concern}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {result.recommendations && result.recommendations.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Recommendations</h3>
                <ul className="space-y-1">
                  {result.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Required Components */}
            {result.requiredComponents && result.requiredComponents.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Required Components</h3>
                <div className="flex flex-wrap gap-2">
                  {result.requiredComponents.map((component, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {component}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function MultiAgentAnalysis({ events }) {
  const [agents, setAgents] = useState({});
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Process events to build agent states
  useEffect(() => {
    events.forEach(event => {
      if (event?.agent_key && event?.stream_event) {
        const { agent_key, agent_name, agent_role, stream_event } = event;
        
        setAgents(prev => {
          const current = prev[agent_key] || {};
          
          // Update agent state based on stream event type
          if (stream_event.type === 'streaming') {
            return {
              ...prev,
              [agent_key]: {
                ...current,
                agent_key,
                agent_name,
                agent_role,
                status: 'loading',
                partial_content: stream_event.partial_content,
                lastUpdate: new Date().toISOString()
              }
            };
          } else if (stream_event.type === 'complete') {
            return {
              ...prev,
              [agent_key]: {
                ...current,
                agent_key,
                agent_name,
                agent_role,
                status: 'success',
                result: stream_event.result,
                lastUpdate: new Date().toISOString()
              }
            };
          } else if (stream_event.type === 'error') {
            return {
              ...prev,
              [agent_key]: {
                ...current,
                agent_key,
                agent_name,
                agent_role,
                status: 'error',
                error: stream_event.message,
                lastUpdate: new Date().toISOString()
              }
            };
          }
          
          return prev;
        });
      }
    });
  }, [events]);

  const agentsList = Object.values(agents);
  
  if (agentsList.length === 0) return null;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <div className="h-4 w-4 bg-gray-300 rounded-full" />;
    }
  };

  return (
    <div className="w-full py-2">
      <Card className="border-0 bg-gradient-to-br from-blue-50 via-blue-25 to-white shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-blue-600" />
            Multi-Agent Analysis
            <Badge variant="secondary" className="ml-auto">
              {agentsList.filter(a => a.status === 'success').length}/{agentsList.length} Complete
            </Badge>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-2">
          {agentsList.map((agent) => {
            const AgentIcon = AGENT_ICONS[agent.agent_key];
            
            return (
              <div key={agent.agent_key} className="flex items-center gap-3 p-2 bg-white/50 rounded-lg">
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex items-center justify-center w-8 h-8 bg-blue-50 rounded-full">
                    {AgentIcon && <AgentIcon className="h-4 w-4 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{agent.agent_name}</div>
                    <div className="text-xs text-gray-500">{agent.agent_role}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {getStatusIcon(agent.status)}
                  
                  {agent.status === 'success' && agent.result && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedAgent(agent)}
                      className="h-7 px-2 text-xs"
                    >
                      View Details
                    </Button>
                  )}
                  
                  {agent.status === 'loading' && agent.partial_content && (
                    <div className="text-xs text-gray-500 max-w-[200px] truncate">
                      {agent.partial_content.substring(0, 50)}...
                    </div>
                  )}
                  
                  {agent.status === 'error' && (
                    <div className="text-xs text-red-600 max-w-[200px] truncate">
                      {agent.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AgentModal 
        agent={selectedAgent} 
        isOpen={!!selectedAgent} 
        onClose={() => setSelectedAgent(null)} 
      />
    </div>
  );
}

export default MultiAgentAnalysis;
