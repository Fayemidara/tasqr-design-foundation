import { Badge } from "@/components/ui/tasqr-badge";
import { Card } from "@/components/ui/tasqr-card";
import { Star } from "lucide-react";

export interface AgentCardProps {
  name: string;
  description: string;
  category: string;
  price: string;
  rating: number;
}

export function AgentCard({ name, description, category, price, rating }: AgentCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-mono text-[18px] leading-tight">{name}</h3>
        <Badge>{category}</Badge>
      </div>
      <p className="text-sm text-foreground/90">{description}</p>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={14}
              className={
                i < Math.round(rating)
                  ? "fill-warning text-warning"
                  : "text-border"
              }
            />
          ))}
          <span className="font-mono text-xs text-muted-foreground ml-1">
            {rating.toFixed(1)}
          </span>
        </div>
        <span className="font-mono text-sm text-foreground">{price}</span>
      </div>
    </Card>
  );
}
