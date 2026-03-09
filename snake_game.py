import pygame
import random
import sys

# --- Constants ---
WINDOW_WIDTH = 720
WINDOW_HEIGHT = 540
CELL_SIZE = 20
GRID_WIDTH = WINDOW_WIDTH // CELL_SIZE
GRID_HEIGHT = WINDOW_HEIGHT // CELL_SIZE
FPS = 12

# --- Colors (Modern Dark Theme) ---
BG_COLOR = (18, 18, 24)
GRID_COLOR = (28, 28, 38)
SNAKE_HEAD_COLOR = (0, 230, 118)
SNAKE_BODY_COLOR = (0, 200, 83)
SNAKE_BODY_ALT = (0, 180, 70)
FOOD_COLOR = (255, 82, 82)
FOOD_GLOW = (255, 82, 82, 80)
SCORE_COLOR = (200, 200, 220)
GAME_OVER_COLOR = (255, 255, 255)
OVERLAY_COLOR = (0, 0, 0, 180)
BORDER_COLOR = (50, 50, 70)

# --- Directions ---
UP = (0, -1)
DOWN = (0, 1)
LEFT = (-1, 0)
RIGHT = (1, 0)


class SnakeGame:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption("🐍 Snake Game")
        self.clock = pygame.time.Clock()
        self.font_large = pygame.font.SysFont("Helvetica", 52, bold=True)
        self.font_medium = pygame.font.SysFont("Helvetica", 28)
        self.font_small = pygame.font.SysFont("Helvetica", 20)
        self.high_score = 0
        self.reset()

    def reset(self):
        """Reset game state for a new game."""
        start_x = GRID_WIDTH // 2
        start_y = GRID_HEIGHT // 2
        self.snake = [(start_x, start_y), (start_x - 1, start_y), (start_x - 2, start_y)]
        self.direction = RIGHT
        self.next_direction = RIGHT
        self.food = self._spawn_food()
        self.score = 0
        self.game_over = False
        self.particles = []

    def _spawn_food(self):
        """Spawn food at a random position not occupied by the snake."""
        while True:
            pos = (random.randint(0, GRID_WIDTH - 1), random.randint(0, GRID_HEIGHT - 1))
            if pos not in self.snake:
                return pos

    def handle_input(self):
        """Process keyboard input."""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            elif event.type == pygame.KEYDOWN:
                if self.game_over:
                    if event.key == pygame.K_SPACE:
                        self.reset()
                    elif event.key == pygame.K_q or event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        sys.exit()
                else:
                    if event.key == pygame.K_UP and self.direction != DOWN:
                        self.next_direction = UP
                    elif event.key == pygame.K_DOWN and self.direction != UP:
                        self.next_direction = DOWN
                    elif event.key == pygame.K_LEFT and self.direction != RIGHT:
                        self.next_direction = LEFT
                    elif event.key == pygame.K_RIGHT and self.direction != LEFT:
                        self.next_direction = RIGHT

    def update(self):
        """Update game state."""
        if self.game_over:
            self._update_particles()
            return

        self.direction = self.next_direction
        head_x, head_y = self.snake[0]
        dx, dy = self.direction
        new_head = (head_x + dx, head_y + dy)

        # Check wall collision
        if not (0 <= new_head[0] < GRID_WIDTH and 0 <= new_head[1] < GRID_HEIGHT):
            self._trigger_game_over()
            return

        # Check self collision
        if new_head in self.snake:
            self._trigger_game_over()
            return

        self.snake.insert(0, new_head)

        # Check food collision
        if new_head == self.food:
            self.score += 10
            if self.score > self.high_score:
                self.high_score = self.score
            self.food = self._spawn_food()
            self._spawn_eat_particles(new_head)
        else:
            self.snake.pop()

        self._update_particles()

    def _trigger_game_over(self):
        """Handle game over state."""
        self.game_over = True
        # Spawn explosion particles at head
        head = self.snake[0]
        for _ in range(30):
            self.particles.append({
                "x": head[0] * CELL_SIZE + CELL_SIZE // 2,
                "y": head[1] * CELL_SIZE + CELL_SIZE // 2,
                "vx": random.uniform(-4, 4),
                "vy": random.uniform(-4, 4),
                "life": random.randint(20, 50),
                "color": (255, random.randint(50, 150), 50),
                "size": random.randint(2, 5),
            })

    def _spawn_eat_particles(self, pos):
        """Spawn particles when food is eaten."""
        for _ in range(12):
            self.particles.append({
                "x": pos[0] * CELL_SIZE + CELL_SIZE // 2,
                "y": pos[1] * CELL_SIZE + CELL_SIZE // 2,
                "vx": random.uniform(-3, 3),
                "vy": random.uniform(-3, 3),
                "life": random.randint(10, 25),
                "color": FOOD_COLOR,
                "size": random.randint(2, 4),
            })

    def _update_particles(self):
        """Update particle positions and lifetimes."""
        for p in self.particles:
            p["x"] += p["vx"]
            p["y"] += p["vy"]
            p["life"] -= 1
        self.particles = [p for p in self.particles if p["life"] > 0]

    def draw(self):
        """Render the game."""
        self.screen.fill(BG_COLOR)

        # Draw subtle grid
        for x in range(0, WINDOW_WIDTH, CELL_SIZE):
            pygame.draw.line(self.screen, GRID_COLOR, (x, 0), (x, WINDOW_HEIGHT))
        for y in range(0, WINDOW_HEIGHT, CELL_SIZE):
            pygame.draw.line(self.screen, GRID_COLOR, (0, y), (WINDOW_WIDTH, y))

        # Draw border
        pygame.draw.rect(self.screen, BORDER_COLOR, (0, 0, WINDOW_WIDTH, WINDOW_HEIGHT), 2)

        # Draw food with glow effect
        food_rect = pygame.Rect(
            self.food[0] * CELL_SIZE, self.food[1] * CELL_SIZE, CELL_SIZE, CELL_SIZE
        )
        # Glow
        glow_surf = pygame.Surface((CELL_SIZE * 3, CELL_SIZE * 3), pygame.SRCALPHA)
        pygame.draw.circle(
            glow_surf, (255, 82, 82, 40), (CELL_SIZE * 1.5, CELL_SIZE * 1.5), CELL_SIZE * 1.2
        )
        self.screen.blit(
            glow_surf,
            (food_rect.x - CELL_SIZE, food_rect.y - CELL_SIZE),
        )
        pygame.draw.rect(self.screen, FOOD_COLOR, food_rect, border_radius=6)

        # Draw snake
        for i, segment in enumerate(self.snake):
            rect = pygame.Rect(
                segment[0] * CELL_SIZE, segment[1] * CELL_SIZE, CELL_SIZE, CELL_SIZE
            )
            if i == 0:
                # Head
                pygame.draw.rect(self.screen, SNAKE_HEAD_COLOR, rect, border_radius=6)
                # Eyes
                dx, dy = self.direction
                eye_size = 4
                if self.direction in (UP, DOWN):
                    left_eye = (rect.x + 5, rect.y + CELL_SIZE // 2 + dy * 3)
                    right_eye = (rect.x + CELL_SIZE - 7, rect.y + CELL_SIZE // 2 + dy * 3)
                else:
                    left_eye = (rect.x + CELL_SIZE // 2 + dx * 3, rect.y + 5)
                    right_eye = (rect.x + CELL_SIZE // 2 + dx * 3, rect.y + CELL_SIZE - 7)
                pygame.draw.circle(self.screen, (20, 20, 30), left_eye, eye_size)
                pygame.draw.circle(self.screen, (20, 20, 30), right_eye, eye_size)
            else:
                color = SNAKE_BODY_COLOR if i % 2 == 0 else SNAKE_BODY_ALT
                pygame.draw.rect(self.screen, color, rect, border_radius=4)

        # Draw particles
        for p in self.particles:
            alpha = max(0, min(255, int(255 * (p["life"] / 50))))
            surf = pygame.Surface((p["size"] * 2, p["size"] * 2), pygame.SRCALPHA)
            pygame.draw.circle(
                surf, (*p["color"], alpha), (p["size"], p["size"]), p["size"]
            )
            self.screen.blit(surf, (p["x"] - p["size"], p["y"] - p["size"]))

        # Draw score HUD
        score_text = self.font_small.render(f"SCORE: {self.score}", True, SCORE_COLOR)
        high_text = self.font_small.render(f"HIGH: {self.high_score}", True, SCORE_COLOR)
        self.screen.blit(score_text, (12, 8))
        self.screen.blit(high_text, (WINDOW_WIDTH - high_text.get_width() - 12, 8))

        # Draw game over overlay
        if self.game_over:
            overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 160))
            self.screen.blit(overlay, (0, 0))

            title = self.font_large.render("GAME OVER", True, GAME_OVER_COLOR)
            score_line = self.font_medium.render(f"Score: {self.score}", True, SCORE_COLOR)
            restart = self.font_small.render("Press SPACE to restart  |  Q to quit", True, SCORE_COLOR)

            self.screen.blit(title, (WINDOW_WIDTH // 2 - title.get_width() // 2, WINDOW_HEIGHT // 2 - 70))
            self.screen.blit(score_line, (WINDOW_WIDTH // 2 - score_line.get_width() // 2, WINDOW_HEIGHT // 2))
            self.screen.blit(restart, (WINDOW_WIDTH // 2 - restart.get_width() // 2, WINDOW_HEIGHT // 2 + 50))

        pygame.display.flip()

    def run(self):
        """Main game loop."""
        while True:
            self.handle_input()
            self.update()
            self.draw()
            self.clock.tick(FPS)


if __name__ == "__main__":
    game = SnakeGame()
    game.run()
